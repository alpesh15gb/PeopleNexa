import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { prisma } from "@/lib/prisma";
import { refreshEarnedLeaveBalances } from "@/lib/leave-accrual-refresh";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { LeavesPanel } from "./leaves-panel";
import { leaveCancellationHistory } from "@/lib/leave-request-history";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import {
  calculateLeaveBalance,
  importedLeaveOpening,
  policyHasUnlimitedEntitlement,
} from "@/lib/leave-balance";

export const dynamic = "force-dynamic";

export default async function EmployeeLeavesPage({ searchParams }: {
  searchParams: Promise<{ view?: string; range?: string; action?: string }>;
}) {
  const session = await requireSession();
  const [lang, query] = await Promise.all([getLang(), searchParams]);

  const [types, requests, employee] = await Promise.all([
    prisma.leaveType.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true, status: true, loginOnly: true, branch: { select: { locationId: true } }, tenant: { select: { config: true } } },
    }),
  ]);
  let balanceRefreshPending = false;
  if (employee && !employee.loginOnly && employee.status === "active") {
    try {
      await prisma.$transaction((tx) => refreshEarnedLeaveBalances(tx, session.tenantId, [session.sub]), { isolationLevel: "Serializable" });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034") throw error;
      balanceRefreshPending = true;
    }
  }
  const region = workspaceRegion(employee?.tenant.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const policyDate = configurationEffectiveAtISTDay(new Date(`${today}T00:00:00Z`));
  const locationId = employee?.branch?.locationId ?? employee?.locationId ?? null;
  const [policyBalances, policyRecords, importedBalances, cancellationHistory] = await Promise.all([
    prisma.leavePolicyBalance.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        policyPeriod: {
          effectiveFrom: { lte: policyDate },
          AND: [
            {
              OR: [
                { effectiveTo: null },
                {
                  effectiveTo: {
                    gte: policyDate,
                  },
                },
              ],
            },
            {
              OR: [
                {
                  locationId,
                },
                { locationId: null },
              ],
            },
          ],
        },
      },
      include: { policyPeriod: { select: { configurationId: true, effectiveFrom: true, effectiveTo: true } } },
    }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "leave_policy", active: true },
    }),
    prisma.leaveBalanceImportEntry.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        periodEnd: { lte: new Date() },
      },
      orderBy: { periodEnd: "desc" },
    }),
    leaveCancellationHistory(session.tenantId, requests.filter((request) => request.status === "approved" || request.status === "cancelled").map((request) => request.id)),
  ]);

  const balance = types.map((t) => {
    const policy = resolveLeavePolicy(policyRecords, locationId, policyDate, t.code);
    const allocated = policy && policyBalances.find((item) =>
      item.leaveTypeId === t.id && item.policyPeriod.configurationId === policy.configurationId,
    );
    const imported = importedBalances.find((item) => item.leaveTypeId === t.id);
    const policyRequests = allocated
      ? requests.filter(
          (request) =>
            request.leaveTypeId === t.id &&
            request.leavePolicySnapshot &&
            typeof request.leavePolicySnapshot === "object" &&
            (request.leavePolicySnapshot as Record<string, unknown>)
              .policyPeriodId === allocated.policyPeriodId,
        )
      : requests.filter(
          (request) =>
            request.leaveTypeId === t.id &&
            (!imported || request.fromDate >= imported.periodEnd),
        );
    const used = policyRequests
      .filter((request) => request.status === "approved")
      .reduce((sum, request) => sum + request.days, 0);
    const pending = policyRequests
      .filter((request) => request.status === "pending")
      .reduce((sum, request) => sum + request.days, 0);
    const entitlement = allocated
      ? (allocated.entitlement ?? 0) + allocated.carryForward
      : imported
        ? imported.available
        : t.maxDays;
    const unlimitedEntitlement = allocated
      ? policyHasUnlimitedEntitlement(allocated.policySnapshot)
      : !imported && t.unlimitedEntitlement;
    const remaining = calculateLeaveBalance({
      cap: allocated ? entitlement : imported ? 0 : t.maxDays,
      opening: importedLeaveOpening(Boolean(allocated), imported?.available),
      credited: 0,
      used,
      pending,
      unlimitedEntitlement,
    }).available;
    const rules = allocated ? policy.rules : null;
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      color: t.color,
      opening: allocated ? 0 : (imported?.openingBalance ?? 0),
      credited: allocated
        ? (allocated.entitlement ?? 0) + allocated.carryForward
        : (imported?.credited ?? 0),
      used,
      pending,
      remaining,
      policyNote: allocated
        ? "Current policy-period allocation"
        : imported
          ? `Imported snapshot through ${imported.periodEnd.toISOString().slice(0, 7)}`
          : unlimitedEntitlement
            ? "Unlimited entitlement"
            : t.maxDays === null || t.maxDays === 0
              ? "No fixed allowance. Days are available when credited by policy or import."
            : "Leave type allowance",
      policy: {
        requiresApproval: rules?.requiresApproval ?? t.requiresApproval,
        requiresReason: rules?.requiresReason ?? false,
        allowsHalfDay: rules?.allowsHalfDay ?? false,
        dayCounting: rules?.dayCounting ?? "legacy" as const,
        noticeDays: rules?.noticeDays ?? 0,
        minServiceDays: rules?.minServiceDays ?? 0,
        maxConsecutiveDays: rules?.maxConsecutiveDays ?? null,
        effectiveFrom: allocated?.policyPeriod.effectiveFrom.toISOString().slice(0, 10) ?? null,
        effectiveTo: allocated?.policyPeriod.effectiveTo?.toISOString().slice(0, 10) ?? null,
      },
    };
  });

  const view = query.view === "requests" ? "requests" : "summary";
  const range = query.range === "past" || query.range === "upcoming" ? query.range : "all";

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "leaves.title")}
        description={t(lang, "leaves.desc")}
      />
      {balanceRefreshPending && view === "summary" && <p role="status" className="text-sm text-muted-foreground">You are viewing the last saved balance. Refresh to check for newer accruals.</p>}
      <LeavesPanel
        key={query.action === "apply" ? "apply" : "leave"}
        balance={balance}
        requests={requests.map((request) => ({ ...request, cancellationDecision: cancellationHistory.get(request.id) }))}
        lang={lang}
        locale={region.locale}
        today={today}
        view={view}
        range={range}
        canApply={!!employee && employee.status === "active" && !employee.loginOnly && balance.length > 0}
        openOnLoad={query.action === "apply"}
      />
    </div>
  );
}
