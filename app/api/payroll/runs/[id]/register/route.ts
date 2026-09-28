import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { payrollOperationLocationId } from "@/lib/location-scope";

const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const scope = await payrollOperationLocationId(session, new URL(req.url).searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId, locationId: scope.locationId }, include: { payslips: { include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const lines = [
    ["Run ID", "Run status", "Period", "Employee number", "Employee", "Gross earnings", "Deductions", "Net pay"],
    ...run.payslips.map((p) => [run.id, run.status, run.month, p.employee.employeeNumber, `${p.employee.firstName} ${p.employee.lastName}`.trim(), p.grossEarnings, p.deductions, p.netSalary]),
  ];
  return new NextResponse(lines.map((line) => line.map(quote).join(",")).join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-register-${run.month}-${run.id}.csv"` } });
}
