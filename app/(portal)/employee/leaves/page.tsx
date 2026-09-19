import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { LeavesPanel } from "./leaves-panel";
import { periodBalance } from "@/lib/leave-policy-period";

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
  const policyBalances = await prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, policyPeriod: { effectiveFrom: { lte: new Date() }, AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, { OR: [{ locationId: employee?.branch?.locationId ?? "" }, { locationId: null }] }] } }, include: { policyPeriod: { select: { locationId: true } } } });

  const usedByType = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "approved" || r.status === "pending") {
      usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.days);
    }
  }

  const balance = types.map((t) => {
    const allocated = policyBalances.filter((item) => item.leaveTypeId === t.id).sort((a, b) => Number(b.policyPeriod.locationId === employee?.branch?.locationId) - Number(a.policyPeriod.locationId === employee?.branch?.locationId))[0];
    return { id: t.id,
    name: t.name,
    code: t.code,
    maxDays: allocated ? allocated.entitlement + allocated.carryForward : t.maxDays,
    color: t.color,
    used: allocated ? requests.filter((request) => request.leaveTypeId === t.id && request.leavePolicySnapshot && typeof request.leavePolicySnapshot === "object" && (request.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocated.policyPeriodId && (request.status === "approved" || request.status === "pending")).reduce((sum, request) => sum + request.days, 0) : usedByType.get(t.id) ?? 0,
    remaining: allocated ? periodBalance(allocated.entitlement, allocated.carryForward, requests.filter((request) => request.leaveTypeId === t.id && request.leavePolicySnapshot && typeof request.leavePolicySnapshot === "object" && (request.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocated.policyPeriodId && (request.status === "approved" || request.status === "pending")).reduce((sum, request) => sum + request.days, 0)) : Math.max(t.maxDays - (usedByType.get(t.id) ?? 0), 0),
    policyPeriodId: allocated?.policyPeriodId ?? null,
  }; });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t(lang, "leaves.title")} description={t(lang, "leaves.desc")} />
      <LeavesPanel balance={balance} requests={requests} lang={lang} />
    </div>
  );
}
