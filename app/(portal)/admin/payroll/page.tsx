import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { monthKey } from "@/lib/dates";
import { managerLocationId } from "@/lib/location-scope";
import { PayrollPanel } from "./payroll-panel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string }> }) {
  const session = await requireSession();
  if (!['admin', 'location_manager'].includes(session.role)) return null;
  const assignedLocationId = await managerLocationId(session);
  if (session.role === 'location_manager' && !assignedLocationId) return null;
  const params = await searchParams;
  if (params.month && !params.period) redirect(`/admin/payroll?${new URLSearchParams({ period: params.month, ...(params.location ? { location: params.location } : {}), ...(params.run ? { run: params.run } : {}) })}`);
  const month = params.period || monthKey(new Date());
  const locations = session.role === 'admin' ? await prisma.location.findMany({ where: { tenantId: session.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [];
  const locationId = session.role === 'location_manager' ? assignedLocationId : locations.some((location) => location.id === params.location) ? params.location! : null;
  const payrolls = await prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, month, locationId: locationId ?? '__location_required__' }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { payslips: true, members: true } }, members: { where: { exception: { not: null } }, select: { id: true, exception: true, employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } } } } });
  const payroll = params.run ? payrolls.find((candidate) => candidate.id === params.run) ?? null : payrolls[0] ?? null;
  const payslips = payroll ? await prisma.payslip.findMany({ where: { tenantId: session.tenantId, payrollRunId: payroll.id }, include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, accountNumber: true, ifscCode: true, department: { select: { name: true } } } } }, orderBy: { employee: { employeeNumber: 'asc' } } }) : [];
  const totals = payslips.reduce((value, payslip) => ({ gross: value.gross + payslip.grossEarnings, deductions: value.deductions + payslip.deductions, net: value.net + payslip.netSalary, paid: value.paid + (payslip.status === 'paid' ? 1 : 0) }), { gross: 0, deductions: 0, net: 0, paid: 0 });
  const source = payslips.find((payslip) => payslip.payrollConfigurationId)?.payrollPolicyRules as { source?: string } | null;
  return <PayrollPanel month={month} locationLabel={locationId ? locations.find((location) => location.id === locationId)?.name ?? 'Assigned location' : 'Select location'} locationId={locationId} locations={locations} rows={payslips.map((payslip) => ({ employee: payslip.employee, payslip: { ...payslip, adjustments: (payslip.adjustments ?? null) as { label: string; amount: number }[] | null } }))} totals={totals} generated={payslips.length} canManageSettings={session.role === 'admin'} payroll={payroll} provenance={source ? { source: source.source ?? 'recorded' } : null} />;
}
