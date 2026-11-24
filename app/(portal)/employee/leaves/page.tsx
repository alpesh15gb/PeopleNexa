import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { dayRangeIST } from "@/lib/dates";
import { recordPageNumber, recordPagination, type RecordSearchParams } from "@/lib/document-expense-pagination";
import type { Prisma } from "@/generated/prisma/client";
import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { prisma } from "@/lib/prisma";
import { refreshEarnedLeaveBalances } from "@/lib/leave-accrual-refresh";
import { requireActiveSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/ui/card";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, offsetDateKey } from "@/lib/workspace-time";
import { LeavesPanel } from "./leaves-panel";
import { leaveCancellationHistory } from "@/lib/leave-request-history";
import { leaveAwaitingReview } from "@/lib/leave-lifecycle";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import {
  calculateLeaveBalance,
  importedLeaveOpening,
  policyHasUnlimitedEntitlement,
} from "@/lib/leave-balance";

export const dynamic = "force-dynamic";

export default async function EmployeeLeavesPage({ searchParams }: {
  searchParams: Promise<RecordSearchParams>;
}) {
  const session = await requireActiveSession();
  const [lang, query] = await Promise.all([getLang(), searchParams]);

  const view = query.view === "requests" ? "requests" : "summary";
  const range = query.range === "past" || query.range === "upcoming" ? query.range : "all";
  const allowedStatuses = ["awaiting_review", "pending", "approved", "rejected", "cancelled", "cancellation_pending"];
  const status = typeof query.status === "string" && allowedStatuses.includes(query.status) ? query.status : "all";
  const scope = { tenantId: session.tenantId, employeeId: session.sub };
  const [types, employee] = await Promise.all([
    prisma.leaveType.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
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
  const day = dayRangeIST(today).start;
  const where: Prisma.LeaveRequestWhereInput = {
    ...scope,
    ...(range === "past" && { toDate: { lt: day } }),
    ...(range === "upcoming" && { toDate: { gte: day } }),
    ...(status === "awaiting_review" ? leaveAwaitingReview : status === "cancellation_pending" ? { status: "approved", cancellationRequestedAt: { not: null } } : status !== "all" ? { status } : {}),
  };
  const requestedPage = recordPageNumber(query.page) ?? 1;
  const pagination = recordPagination(view === "requests" ? await prisma.leaveRequest.count({ where }) : 0, requestedPage, 25);
  const requests = await prisma.leaveRequest.findMany({
    where: view === "requests" ? where : { ...scope, status: { in: ["pending", "approved"] }, toDate: { gte: day } },
    include: { leaveType: true },
    orderBy: view === "summary" || range === "upcoming" ? [{ fromDate: "asc" }, { id: "asc" }] :
      range === "past" ? [{ toDate: "desc" }, { id: "desc" }] : [{ appliedAt: "desc" }, { id: "desc" }],
    skip: view === "requests" ? pagination.offset : 0,
    take: view === "requests" ? pagination.pageSize : 3,
  });

  const policyDate = configurationEffectiveAtISTDay(new Date(`${today}T00:00:00Z`));
  const locationId = employee?.branch?.locationId ?? employee?.locationId ?? null;
  const requestKey = query.submitted ?? query.request;
  const highlightedId = typeof requestKey === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(requestKey) ? requestKey : null;
  const now = new Date();
  const [policyBalances, policyRecords, importedBalances, cancellationHistory, highlightedRequest] = await Promise.all([
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
      },
      orderBy: { periodEnd: "desc" },
    }),
    leaveCancellationHistory(session.tenantId, requests.filter((request) => request.status === "approved" || request.status === "cancelled").map((request) => request.id)),
    highlightedId && view === "requests" ? prisma.leaveRequest.findFirst({
      where: { ...scope, id: highlightedId },
      select: { id: true, fromDate: true, toDate: true, status: true, days: true, reviewNote: true, cancellationRequestedBy: true, leaveType: { select: { name: true, color: true } } },
    }) : null,
  ]);

  const relevantPolicyRecords = policyRecords.filter((record) => record.locationId === null || record.locationId === locationId);
  const nextPolicyChange = relevantPolicyRecords.filter((record) => record.effectiveFrom > policyDate).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
  const dayBeforePolicyChange = nextPolicyChange ? offsetDateKey(nextPolicyChange.effectiveFrom.toISOString().slice(0, 10), -1) : null;
  const balance = await Promise.all(types.map(async (t) => {
    const policy = resolveLeavePolicy(policyRecords, locationId, policyDate, t.code);
    const allocated = policy && policyBalances.find((item) =>
      item.leaveTypeId === t.id && item.policyPeriod.configurationId === policy.configurationId,
    );
    const imported = importedBalances.find((item) => item.leaveTypeId === t.id && item.periodEnd <= now);
    const commitments = await prisma.leaveRequest.groupBy({
      by: ["status"],
      where: {
        ...scope,
        leaveTypeId: t.id,
        status: { in: ["pending", "approved"] },
        ...(allocated ? { leavePolicySnapshot: { path: ["policyPeriodId"], equals: allocated.policyPeriodId } } :
          imported ? { fromDate: { gte: imported.periodEnd } } : {}),
      },
      _sum: { days: true },
    });
    const used = commitments.find((row) => row.status === "approved")?._sum.days ?? 0;
    const pending = commitments.find((row) => row.status === "pending")?._sum.days ?? 0;
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
    const endOfAllocation = allocated?.policyPeriod.effectiveTo?.toISOString().slice(0, 10) ?? null;
    const endOfPolicy = policy ? relevantPolicyRecords.find((record) => record.id === policy.configurationId)?.effectiveTo?.toISOString().slice(0, 10) ?? null : null;
    const estimateUntil = [endOfAllocation, endOfPolicy, dayBeforePolicyChange].filter((date): date is string => date !== null).sort()[0] ?? null;
    const plainLegacyBalance = !relevantPolicyRecords.length && !importedBalances.some((item) => item.leaveTypeId === t.id);
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
      estimateWindow: allocated || plainLegacyBalance ? { from: today, to: estimateUntil } : null,
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
  }));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "leaves.title")}
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
        requestFilter={status}
        page={view === "requests" ? pagination.page : requestedPage}
        highlightedRequest={highlightedRequest}
        justSubmitted={typeof query.submitted === "string" && query.submitted === highlightedRequest?.id}
        canApply={!!employee && employee.status === "active" && !employee.loginOnly && balance.length > 0}
        openOnLoad={query.action === "apply"}
      />
      {view === "requests" && <DocumentExpensePagination path="/employee/leaves" params={{ view, range, status: status !== "all" ? status : undefined }} pagination={pagination} label="leave requests" />}
    </div>
  );
}
