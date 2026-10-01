import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { payrollOperationLocationId } from "@/lib/location-scope";
import { documentSnapshotForResponse } from "@/lib/payslip-document";
import { payrollRegisterWorkbook } from "@/lib/payroll-register";
import { requireActiveSession } from "@/lib/session";

export const runtime = "nodejs";
const DOWNLOADABLE_STATUSES = new Set(["draft", "reviewed", "approved", "finalized", "paid"]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const scope = await payrollOperationLocationId(session, new URL(req.url).searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId, locationId: scope.locationId }, include: { payslips: { select: { grossEarnings: true, deductions: true, netSalary: true, inputSnapshot: true, documentSnapshot: true } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!DOWNLOADABLE_STATUSES.has(run.status)) return NextResponse.json({ error: "A register is unavailable for cancelled or reversed payroll runs." }, { status: 409 });
  const buffer = await payrollRegisterWorkbook({ ...run, payslips: run.payslips.map((payslip) => ({ ...payslip, document: documentSnapshotForResponse(payslip.documentSnapshot) })) });
  return new NextResponse(buffer as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="payroll-register-${run.month}-${run.id}.xlsx"` } });
}
