import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { payrollOperationLocationId } from "@/lib/location-scope";
import { documentSnapshotForResponse } from "@/lib/payslip-document";

const quote = (value: string | number | null | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const scope = await payrollOperationLocationId(session, new URL(req.url).searchParams.get("locationId"));
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: session.role === "location_manager" ? 403 : 400 });
  const run = await prisma.payrollRun.findFirst({ where: { id, tenantId: session.tenantId, locationId: scope.locationId }, include: { payslips: { include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } } });
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const documents = run.payslips.map((payslip) => ({ payslip, document: documentSnapshotForResponse(payslip.documentSnapshot) }));
  if (!documents.some(({ document }) => document?.totals.earnedGross !== undefined)) {
    const legacyLines = [
      ["Run ID", "Run status", "Period", "Employee number", "Employee", "Gross earnings", "Deductions", "Net pay"],
      ...run.payslips.map((payslip) => [run.id, run.status, run.month, payslip.employee.employeeNumber, `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim(), payslip.grossEarnings, payslip.deductions, payslip.netSalary]),
    ];
    return new NextResponse(legacyLines.map((line) => line.map(quote).join(",")).join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-register-${run.month}-${run.id}.csv"` } });
  }
  const componentColumns = new Map<string, string>();
  for (const { document } of documents) for (const component of document?.components ?? []) componentColumns.set(component.code, component.label);
  const componentHeaders = [...componentColumns].flatMap(([code, label]) => [`${label} (${code}) contractual`, `${label} (${code}) earned`]);
  const lines: Array<Array<string | number | null | undefined>> = [
    ["Run ID", "Run status", "Period", "Employee number", "Employee", "Gross earnings", "Contractual gross", "Earned gross", "Deductions", "Net pay", ...componentHeaders],
    ...documents.map(({ payslip, document }) => {
      const byCode = new Map(document?.components.map((component) => [component.code, component]) ?? []);
      return [
        run.id,
        run.status,
        run.month,
        document?.employee.employeeNumber ?? payslip.employee.employeeNumber,
        document?.employee.name ?? `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim(),
        document?.totals.gross ?? payslip.grossEarnings,
        document?.totals.gross ?? payslip.grossEarnings,
        document?.totals.earnedGross ?? document?.totals.gross ?? payslip.grossEarnings,
        document?.totals.deductions ?? payslip.deductions,
        document?.totals.net ?? payslip.netSalary,
        ...[...componentColumns].flatMap(([code]) => {
          const component = byCode.get(code);
          return [component?.contractual ?? null, component?.earned ?? null];
        }),
      ];
    }),
  ];
  return new NextResponse(lines.map((line) => line.map(quote).join(",")).join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-register-${run.month}-${run.id}.csv"` } });
}
