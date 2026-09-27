import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isMonthKey, monthKey } from "@/lib/dates";
import { managerLocationId } from "@/lib/location-scope";
import { isFinancialHistoryRun } from "@/lib/payroll-reporting";
import { PayrollDashboard } from "./payroll-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPayrollDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; location?: string }> }) {
  const session = await requireSession();
  if (!['admin', 'location_manager'].includes(session.role)) return null;
  const assignedLocationId = await managerLocationId(session);
  if (session.role === 'location_manager' && !assignedLocationId) return null;
  const params = await searchParams;
  const thisMonth = monthKey(new Date());
  const to = isMonthKey(params.to ?? '') ? params.to! : thisMonth;
  const from = isMonthKey(params.from ?? '') && params.from! <= to ? params.from! : `${to.slice(0, 4)}-01`;
  const locations = session.role === 'admin' ? await prisma.location.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
  const locationId = session.role === 'location_manager' ? assignedLocationId : locations.some((location) => location.id === params.location) ? params.location! : null;
  const runs = await prisma.payrollRun.findMany({
    where: { tenantId: session.tenantId, month: { gte: from, lte: to }, ...(locationId ? { locationId } : {}), status: { in: ['finalized', 'paid'] } },
    include: { payslips: { select: { employeeId: true, grossEarnings: true, deductions: true, netSalary: true, employee: { select: { department: { select: { name: true } }, branch: { select: { name: true } } } } } } },
    orderBy: { month: 'asc' },
  });
  const financialRuns = runs.filter((run) => isFinancialHistoryRun(run.status));
  const monthlyByPeriod = new Map<string, { net: number; employees: number }>();
  financialRuns.forEach((run) => { const total = monthlyByPeriod.get(run.month) ?? { net: 0, employees: 0 }; total.net += run.payslips.reduce((sum, slip) => sum + slip.netSalary, 0); total.employees += run.payslips.length; monthlyByPeriod.set(run.month, total); });
  const monthly = [...monthlyByPeriod.entries()].map(([month, value]) => ({ month, ...value }));
  const slips = financialRuns.flatMap((run) => run.payslips);
  const totals = slips.reduce((sum, slip) => ({ gross: sum.gross + slip.grossEarnings, deductions: sum.deductions + slip.deductions, net: sum.net + slip.netSalary }), { gross: 0, deductions: 0, net: 0 });
  const costs = new Map<string, number>();
  slips.forEach((slip) => { const name = slip.employee.department?.name ?? slip.employee.branch?.name ?? 'Unassigned'; costs.set(name, (costs.get(name) ?? 0) + slip.netSalary); });
  return <PayrollDashboard from={from} to={to} locationId={locationId} locations={locations} monthly={monthly} totals={totals} costs={[...costs.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)} hasHistory={financialRuns.length > 0} />;
}
