import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { monthKey } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PayrollPanel } from "./payroll-panel";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export const dynamic = "force-dynamic";

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") return null;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return null;
  const employeeScope = locationId ? employeeLocationScope(locationId) : {};
  const { month: monthParam } = await searchParams;
  const month = monthParam || monthKey(new Date());

  const [employees, runs, payslips] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, ...employeeScope },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        salary: true,
        accountNumber: true,
        ifscCode: true,
        bankName: true,
        department: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, month, ...(locationId ? { locationId } : {}) }, orderBy: { createdAt: "desc" }, take: 1, include: { _count: { select: { payslips: true } } } }),
    prisma.payslip.findMany({
      where: { tenantId: session.tenantId, month, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const slipByEmp = new Map(
    payslips.map((p) => [
      p.employee.id,
       { ...p, adjustments: (p.adjustments ?? null) as unknown as { label: string; amount: number }[] | null, salaryBreakdown: Array.isArray(p.salaryBreakdown) ? p.salaryBreakdown as unknown as { label: string; amount: number; kind: "earning" | "deduction"; includeInGross: boolean; visibleOnPayslip: boolean }[] : null },
    ])
  );
  const rows = employees.map((emp) => ({
    employee: emp,
    payslip: slipByEmp.get(emp.id) ?? null,
  }));

  const totals = payslips.reduce(
    (acc, p) => {
      acc.gross += p.grossEarnings;
      acc.deductions += p.deductions;
      acc.net += p.netSalary;
      acc.paid += p.status === "paid" ? 1 : 0;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0, paid: 0 }
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Payroll" description="Run-controlled monthly payroll. Compliance exports are operational summaries, not filing-ready." />
      <Card>
        <CardContent className="p-0">
          <PayrollPanel month={month} rows={rows} totals={totals} generated={payslips.length} canManageSettings={session.role === "admin"} run={runs[0] ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
