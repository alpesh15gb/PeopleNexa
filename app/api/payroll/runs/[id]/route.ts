import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canTransitionPayrollRun, payrollRunAuditData, payrollRunTransitionData, type PayrollRunStatus } from "@/lib/payroll-runs";
import { payrollRunPreflight } from "@/lib/payroll-preflight";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const target = String((await req.json().catch(() => ({}))).status ?? "") as PayrollRunStatus;
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId }, include: { payslips: { select: { id: true, netSalary: true, inputSnapshot: true } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canTransitionPayrollRun(run.status, target)) return NextResponse.json({ error: `Cannot move a ${run.status} run directly to ${target}.` }, { status: 409 });
  if (target === "approved" && run.createdBy === session.sub) return NextResponse.json({ error: "The run creator cannot approve their own payroll run." }, { status: 403 });
  if (target === "reviewed" && run.payslips.length === 0) return NextResponse.json({ error: "A run with no payslips cannot be reviewed." }, { status: 409 });
  if (target === "finalized" && run.payslips.some((p) => p.netSalary < 0)) return NextResponse.json({ error: "Resolve negative net-pay exceptions before finalization." }, { status: 409 });
  if (target === "finalized") {
    const errors = payrollRunPreflight(run.payslips);
    if (errors.length) return NextResponse.json({ error: errors.join(" "), preflight: errors }, { status: 409 });
  }
  // Reversal is deliberately a terminal record only; it never mutates paid slips.
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.payrollRun.update({ where: { id }, data: payrollRunTransitionData(target, session.sub) });
    if (target === "paid") await tx.payslip.updateMany({ where: { payrollRunId: id }, data: { status: "paid", paidAt: new Date() } });
    if (target === "finalized") await tx.payslip.updateMany({ where: { payrollRunId: id }, data: { status: "finalized" } });
    await tx.auditLog.create({ data: payrollRunAuditData(id, session.tenantId, session.sub, session.role, run.status, target) });
    return next;
  });
  return NextResponse.json({ run: updated });
}
