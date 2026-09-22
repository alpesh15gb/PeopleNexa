import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { LeavesPanel } from "./leaves-panel";
import { calculateLeaveBalance, policyHasUnlimitedEntitlement } from "@/lib/leave-balance";

export const dynamic = "force-dynamic";

export default async function EmployeeLeavesPage() {
  const session = await requireSession();
  const lang = await getLang();

  const [types, requests, employee] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branch: { select: { locationId: true } } } }),
  ]);
  const [policyBalances, importedBalances] = await Promise.all([
    prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, policyPeriod: { effectiveFrom: { lte: new Date() }, AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, { OR: [{ locationId: employee?.branch?.locationId ?? "" }, { locationId: null }] }] } }, include: { policyPeriod: { select: { locationId: true } } } }),
    prisma.leaveBalanceImportEntry.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, periodEnd: { lte: new Date() } }, orderBy: { periodEnd: "desc" } }),
  ]);

  const usedByType = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "approved" || r.status === "pending") {
      usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.days);
    }
  }

  const balance = types.map((t) => {
    const allocated = policyBalances.filter((item) => item.leaveTypeId === t.id).sort((a, b) => Number(b.policyPeriod.locationId === employee?.branch?.locationId) - Number(a.policyPeriod.locationId === employee?.branch?.locationId))[0];
    const imported = importedBalances.find((item) => item.leaveTypeId === t.id);
    const policyRequests = allocated ? requests.filter((request) => request.leaveTypeId === t.id && request.leavePolicySnapshot && typeof request.leavePolicySnapshot === "object" && (request.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocated.policyPeriodId) : requests.filter((request) => request.leaveTypeId === t.id && (!imported || request.fromDate >= imported.periodEnd));
    const used = policyRequests.filter((request) => request.status === "approved").reduce((sum, request) => sum + request.days, 0);
    const pending = policyRequests.filter((request) => request.status === "pending").reduce((sum, request) => sum + request.days, 0);
    const entitlement = allocated ? (allocated.entitlement ?? 0) + allocated.carryForward : imported ? imported.available : t.maxDays;
    const unlimitedEntitlement = allocated ? policyHasUnlimitedEntitlement(allocated.policySnapshot) : !imported && t.unlimitedEntitlement;
    const remaining = calculateLeaveBalance({ cap: allocated ? entitlement : imported ? 0 : t.maxDays, opening: imported ? imported.available : 0, credited: 0, used, pending, unlimitedEntitlement }).available;
    return { id: t.id,
    name: t.name,
    code: t.code,
    maxDays: entitlement,
    color: t.color,
    opening: imported?.openingBalance ?? 0,
    credited: allocated ? (allocated.entitlement ?? 0) + allocated.carryForward : imported?.credited ?? 0,
    used,
    pending,
    remaining,
    policyNote: allocated ? "Current policy-period allocation" : imported ? `Imported snapshot through ${imported.periodEnd.toISOString().slice(0, 7)}` : t.maxDays === null || t.maxDays === 0 ? "No annual maximum; balance accrues or is imported" : "Leave type allowance",
    policyPeriodId: allocated?.policyPeriodId ?? null,
  }; });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "leaves.title")} description={t(lang, "leaves.desc")} />
      <LeavesPanel balance={balance} requests={requests} lang={lang} />
    </div>
  );
}
