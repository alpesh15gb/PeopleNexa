import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { monthKey } from "@/lib/dates";
import { redirect } from "next/navigation";
import { PayrollPanel } from "../payroll-panel";
import { managerLocationId } from "@/lib/location-scope";

export const dynamic = "force-dynamic";

export default async function ProcessPayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; period?: string; location?: string; run?: string }> }) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") return null;
  const assignedLocationId = await managerLocationId(session);
  if (session.role === "location_manager" && !assignedLocationId) return null;
  const params = await searchParams;
  const month = params.period || params.month || monthKey(new Date());
  const locations = session.role === "admin" ? await prisma.location.findMany({ where: { tenantId: session.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const requestedLocation = params.location || null;
  const locationId = session.role === "location_manager" ? assignedLocationId : locations.some((location) => location.id === requestedLocation) ? requestedLocation : null;
  const [runs, recentRuns] = await Promise.all([
    prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, month, locationId: locationId ?? "__location_required__" }, orderBy: { createdAt: "desc" }, include: { _count: { select: { payslips: true, members: true } }, members: { where: { exception: { not: null } }, select: { id: true, exception: true, employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } } } } }),
    prisma.payrollRun.findMany({ where: { tenantId: session.tenantId, locationId: locationId ?? "__location_required__" }, orderBy: [{ month: "desc" }, { createdAt: "desc" }], take: 6, include: { _count: { select: { payslips: true, members: true } } } }),
  ]);
  const run = params.run ? runs.find((candidate) => candidate.id === params.run) ?? null : runs[0] ?? null;
  const payslips = run ? await prisma.payslip.findMany({ where: { tenantId: session.tenantId, payrollRunId: run.id }, include: { employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true, salary: true, accountNumber: true, ifscCode: true, bankName: true, department: { select: { name: true } }, branch: { select: { name: true } } } } }, orderBy: { employee: { employeeNumber: "asc" } } }) : [];
  const rows = payslips.map((payslip) => ({ employee: payslip.employee, payslip: { ...payslip, adjustments: (payslip.adjustments ?? null) as { label: string; amount: number }[] | null } }));
  const totals = payslips.reduce((acc, payslip) => ({ gross: acc.gross + payslip.grossEarnings, deductions: acc.deductions + payslip.deductions, net: acc.net + payslip.netSalary, paid: acc.paid + (payslip.status === "paid" ? 1 : 0) }), { gross: 0, deductions: 0, net: 0, paid: 0 });
  const provenance = payslips.find((payslip) => payslip.payrollConfigurationId) ?? null;
  const rules = provenance?.payrollPolicyRules as { source?: string; jurisdiction?: string | null; profile?: string } | null;
  if (!run) redirect(`/admin/payroll?${new URLSearchParams({ period: month, ...(locationId ? { location: locationId } : {}) })}`);
  return <PayrollPanel month={month} locationLabel={locationId ? locations.find((location) => location.id === locationId)?.name ?? "Assigned location" : "Select location"} locationId={locationId} locations={locations} rows={rows} totals={totals} generated={payslips.length} canManageSettings={session.role === "admin"} payroll={run} provenance={provenance ? { source: rules?.source ?? "recorded" } : null} reviewMode />;
}
