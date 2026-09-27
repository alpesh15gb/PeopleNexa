import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { monthKey } from "@/lib/dates";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { PayrollPanel } from "./payroll-panel";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export const dynamic = "force-dynamic";

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string }>;
}) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") return null;
  const assignedLocationId = await managerLocationId(session);
  if (session.role === "location_manager" && !assignedLocationId) return null;
  const params = await searchParams;
  const month = params.period || params.month || monthKey(new Date());
  const locations = session.role === "admin" ? await prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const requestedLocation = params.location || null;
  const locationId = session.role === "location_manager" ? assignedLocationId : locations.some((location) => location.id === requestedLocation) ? requestedLocation : null;
  const employeeScope = locationId ? employeeLocationScope(locationId) : {};

  const [runs, recentRuns] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { tenantId: session.tenantId, month, ...(locationId ? { locationId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { payslips: true, members: true } },
        members: { where: { exception: { not: null } }, select: { id: true, exception: true, employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } } },
      },
    }),
    prisma.payrollRun.findMany({
      where: { tenantId: session.tenantId, ...(locationId ? { locationId } : {}) },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: { _count: { select: { payslips: true, members: true } } },
    }),
  ]);
  const run = params.run ? runs.find((candidate) => candidate.id === params.run) ?? null : runs[0] ?? null;
  const payslips = run ? await prisma.payslip.findMany({
    where: { tenantId: session.tenantId, payrollRunId: run.id },
    include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, salary: true, accountNumber: true, ifscCode: true, bankName: true, department: { select: { name: true } }, branch: { select: { name: true } } } } },
    orderBy: { employee: { employeeNumber: "asc" } },
  }) : [];

  const slipByEmp = new Map(
    payslips.map((p) => [
      p.employee.id,
       { ...p, adjustments: (p.adjustments ?? null) as unknown as { label: string; amount: number }[] | null, salaryBreakdown: Array.isArray(p.salaryBreakdown) ? p.salaryBreakdown as unknown as { label: string; amount: number; kind: "earning" | "deduction"; includeInGross: boolean; visibleOnPayslip: boolean }[] : null },
    ])
  );
  const rows = payslips.map((payslip) => ({ employee: payslip.employee, payslip: slipByEmp.get(payslip.employee.id) ?? null }));

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
    <SettingsWorkspace eyebrow="PeopleNexa payroll" title="Payroll operations" description="Run-controlled calculation and payout workspace. Policy configuration remains separate from payroll run controls." tabs={session.role === "admin" ? [{ label: "Payroll configuration", href: "/admin/payroll/configuration" }, { label: "Salary revisions", href: "/admin/payroll/salary-revisions" }] : undefined}>
       <PayrollPanel month={month} locationLabel={locationId ? locations.find((location) => location.id === locationId)?.name ?? "Assigned location" : "All locations"} locationId={locationId} locations={locations} rows={rows} totals={totals} generated={payslips.length} canManageSettings={session.role === "admin"} run={run} history={recentRuns} />
    </SettingsWorkspace>
  );
}
