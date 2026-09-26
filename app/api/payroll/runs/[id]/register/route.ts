import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { managerLocationId } from "@/lib/location-scope";

const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { locationId } : {}) }, include: { payslips: { include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const lines = [
    ["Run ID", "Run status", "Period", "Employee number", "Employee", "Gross earnings", "Deductions", "Net pay"],
    ...run.payslips.map((p) => [run.id, run.status, run.month, p.employee.employeeNumber, `${p.employee.firstName} ${p.employee.lastName}`.trim(), p.grossEarnings, p.deductions, p.netSalary]),
  ];
  return new NextResponse(lines.map((line) => line.map(quote).join(",")).join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-register-${run.month}-${run.id}.csv"` } });
}
