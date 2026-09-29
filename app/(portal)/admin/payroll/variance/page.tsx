import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { isMonthKey, monthKey } from "@/lib/dates";
import { managerLocationId } from "@/lib/location-scope";
import { comparePayrollRuns, isFinancialHistoryRun } from "@/lib/payroll-reporting";
import { PayrollVariance } from "./payroll-variance";

export const dynamic = "force-dynamic";

export default async function PayrollVariancePage({ searchParams }: { searchParams: Promise<{ reference?: string; current?: string; location?: string }> }) {
  const session = await requireSession();
  if (!['admin', 'location_manager'].includes(session.role)) return null;
  const assignedLocationId = await managerLocationId(session);
  if (session.role === 'location_manager' && !assignedLocationId) return null;
  const params = await searchParams;
  const current = isMonthKey(params.current ?? '') ? params.current! : monthKey(new Date());
  const reference = isMonthKey(params.reference ?? '') ? params.reference! : `${current.slice(0, 4)}-${String(Math.max(1, Number(current.slice(5)) - 1)).padStart(2, '0')}`;
  const locations = session.role === 'admin' ? await prisma.location.findMany({ where: { tenantId: session.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
  const locationId = session.role === 'location_manager' ? assignedLocationId : locations.some((location) => location.id === params.location) ? params.location! : null;
  const runs = await prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, month: { in: [reference, current] }, locationId: locationId ?? '__location_required__', status: { in: ['finalized', 'paid'] } }, include: { payslips: { select: { employeeId: true, grossEarnings: true, deductions: true, netSalary: true, employee: { select: { employeeNumber: true, firstName: true, lastName: true } } } } } });
  const referenceRuns = runs.filter((run) => run.month === reference && isFinancialHistoryRun(run.status));
  const currentRuns = runs.filter((run) => run.month === current && isFinancialHistoryRun(run.status));
  const referenceSlips = referenceRuns.flatMap((run) => run.payslips);
  const currentSlips = currentRuns.flatMap((run) => run.payslips);
  const names = new Map([...referenceSlips, ...currentSlips].map((slip) => [slip.employeeId, `${slip.employee.firstName} ${slip.employee.lastName}`.trim() || slip.employee.employeeNumber]));
  const comparison = referenceSlips.length && currentSlips.length ? comparePayrollRuns(referenceSlips, currentSlips) : null;
   return <PayrollVariance reference={reference} current={current} locationId={locationId} locations={locations} referenceRun={referenceRuns.length ? { status: referenceRuns.map((run) => run.status).join(', '), count: referenceSlips.length } : null} currentRun={currentRuns.length ? { status: currentRuns.map((run) => run.status).join(', '), count: currentSlips.length } : null} comparison={comparison ? { totals: comparison.totals, rows: comparison.rows.map((row) => ({ ...row, name: names.get(row.employeeId) ?? row.employeeId })) } : null} />;
}
