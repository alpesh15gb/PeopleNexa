import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canTransitionPayrollRun, paymentEvidence, payrollRunAuditData, payrollRunTransitionData, type PayrollRunStatus } from "@/lib/payroll-runs";
import { payrollRunPreflight } from "@/lib/payroll-preflight";
import { payrollOperationLocationId } from "@/lib/location-scope";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const target = String(body.status ?? "") as PayrollRunStatus;
  const scope = await payrollOperationLocationId(session, typeof body.locationId === "string" ? body.locationId : null);
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId, locationId: scope.locationId }, include: { payslips: { select: { id: true, netSalary: true, inputSnapshot: true, documentSnapshot: true } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canTransitionPayrollRun(run.status, target)) return NextResponse.json({ error: `Cannot move a ${run.status} run directly to ${target}.` }, { status: 409 });
  if (target === "approved" && run.createdBy === session.sub) return NextResponse.json({ error: "The run creator cannot approve their own payroll run." }, { status: 403 });
  if (target === "reviewed" && run.payslips.length === 0) return NextResponse.json({ error: "A run with no payslips cannot be reviewed." }, { status: 409 });
  if (target === "finalized" && run.payslips.some((p) => p.netSalary < 0)) return NextResponse.json({ error: "Resolve negative net-pay exceptions before finalization." }, { status: 409 });
  if (target === "finalized") {
    const errors = payrollRunPreflight(run.payslips);
    if (errors.length) return NextResponse.json({ error: errors.join(" "), preflight: errors }, { status: 409 });
  }
  const cancellationReason = target === "cancelled" ? String(body.reason ?? "").trim() : "";
  if (target === "cancelled" && (!cancellationReason || cancellationReason.length > 500)) return NextResponse.json({ error: "A cancellation reason is required (max 500 characters)." }, { status: 400 });
  const net = run.payslips.reduce((total, slip) => total + slip.netSalary, 0);
  const evidence = target === "paid" ? paymentEvidence(body, run.payslips.length, net) : null;
  if (evidence && "error" in evidence) return NextResponse.json({ error: evidence.error }, { status: 400 });
  // Reversal is deliberately a terminal record only; it never mutates paid slips.
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.payrollRun.update({ where: { id }, data: { ...payrollRunTransitionData(target, session.sub), ...(evidence?.value ?? {}), ...(target === "cancelled" ? { note: cancellationReason } : {}) } });
    if (target === "paid") await tx.payslip.updateMany({ where: { payrollRunId: id }, data: { status: "paid", paidAt: new Date(), paidVia: evidence!.value.paymentMethod, paymentRef: evidence!.value.paymentReference } });
    if (target === "finalized") await tx.payslip.updateMany({ where: { payrollRunId: id }, data: { status: "finalized" } });
    await tx.auditLog.create({ data: { ...payrollRunAuditData(id, session.tenantId, session.sub, session.role, run.status, target), ...((target === "paid" || target === "cancelled") ? { after: { status: target, ...(target === "paid" ? { ...evidence!.value, count: run.payslips.length, net } : { reason: cancellationReason }) } } : {}) } });
    return next;
  });
  return NextResponse.json({ run: updated });
}
