import { NextRequest, NextResponse } from "next/server";
import { refreshEarnedLeaveBalances } from "@/lib/leave-accrual-refresh";
import {
  calculateLeaveBalance,
  importedLeaveOpening,
  isEarnedLeave,
  leaveBalanceScope,
  leaveBalanceSource,
  policyHasUnlimitedEntitlement,
} from "@/lib/leave-balance";
import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { resolveLeavePolicy } from "@/lib/leave-policy";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { managerLocationId } from "@/lib/location-scope";

const PAGE_SIZE = 25;

export async function GET(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const manager =
    session.role === "location_manager"
      ? { locationId: await managerLocationId(session) }
      : null;
  const scope = leaveBalanceScope(session.role, manager);
  if (!scope)
    return NextResponse.json(
      { error: "no location assigned" },
      { status: 403 },
    );

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const leaveTypeId = request.nextUrl.searchParams.get("leaveTypeId") || null;
  const sourceFilter =
    request.nextUrl.searchParams.get("source") === "imported"
      ? "imported"
      : null;
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const preferredPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const clock = new Date();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const todayKey = dateKeyInTimeZone(clock, workspaceRegion(tenant?.config).timeZone);
  const now = configurationEffectiveAtISTDay(new Date(`${todayKey}T00:00:00Z`));
  const where = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    AND: [
      scope,
      ...(query
        ? [
            {
              OR: [
                {
                  firstName: { contains: query, mode: "insensitive" as const },
                },
                { lastName: { contains: query, mode: "insensitive" as const } },
                {
                  employeeNumber: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          ]
        : []),
    ],
    ...(sourceFilter
      ? {
          leaveBalanceImportEntries: {
            some: {
              tenantId: session.tenantId,
              ...(leaveTypeId ? { leaveTypeId } : {}),
              periodEnd: { lte: clock },
            },
          },
        }
      : {}),
  };
  const total = await prisma.employee.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(preferredPage, pages);
  const [employees, types] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        locationId: true,
        branch: { select: { name: true, locationId: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.leaveType.findMany({
      where: {
        tenantId: session.tenantId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        maxDays: true,
        unlimitedEntitlement: true,
      },
      orderBy: { code: "asc" },
    }),
  ]);
  const employeeIds = employees.map((employee) => employee.id);
  let balanceRefreshPending = false;
  try {
    await prisma.$transaction(
      (tx) => refreshEarnedLeaveBalances(tx, session.tenantId, employeeIds, clock),
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "P2034") throw error;
    balanceRefreshPending = true;
  }
  const [requests, allocations, imports, policyRecords] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: employeeIds },
        ...(leaveTypeId ? { leaveTypeId } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        leaveTypeId: true,
        days: true,
        status: true,
        fromDate: true,
        toDate: true,
        appliedAt: true,
        leavePolicySnapshot: true,
      },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.leavePolicyBalance.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: employeeIds },
        ...(leaveTypeId ? { leaveTypeId } : {}),
        policyPeriod: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
      },
      include: { policyPeriod: { select: { configurationId: true } } },
    }),
    prisma.leaveBalanceImportEntry.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: employeeIds },
        ...(leaveTypeId ? { leaveTypeId } : {}),
        periodEnd: { lte: clock },
      },
      orderBy: { periodEnd: "desc" },
    }),
    prisma.configurationRecord.findMany({
      where: { tenantId: session.tenantId, kind: "leave_policy", active: true },
      select: {
        id: true,
        locationId: true,
        version: true,
        active: true,
        effectiveFrom: true,
        effectiveTo: true,
        payload: true,
      },
    }),
  ]);

  const balances = employees
    .map((employee) => ({
      employee: { ...employee, location: employee.branch?.name ?? null },
      balances: types
        .filter((type) => !leaveTypeId || type.id === leaveTypeId)
        .map((type) => {
          const employeeLocationId =
            employee.branch?.locationId ?? employee.locationId;
          const policy = resolveLeavePolicy(policyRecords, employeeLocationId, now, type.code);
          const allocation = policy && allocations.find((item) =>
            item.employeeId === employee.id &&
            item.leaveTypeId === type.id &&
            item.policyPeriod.configurationId === policy.configurationId,
          );
          const imported = imports.find(
            (item) =>
              item.employeeId === employee.id && item.leaveTypeId === type.id,
          );
          const relevant = requests.filter(
            (item) =>
              item.employeeId === employee.id &&
              item.leaveTypeId === type.id &&
              (allocation
                ? item.leavePolicySnapshot &&
                  typeof item.leavePolicySnapshot === "object" &&
                  (item.leavePolicySnapshot as Record<string, unknown>)
                    .policyPeriodId === allocation.policyPeriodId
                : !imported || item.fromDate >= imported.periodEnd),
          );
          const used = relevant
            .filter((item) => item.status === "approved")
            .reduce((sum, item) => sum + item.days, 0);
          const pending = relevant
            .filter((item) => item.status === "pending")
            .reduce((sum, item) => sum + item.days, 0);
          const cap = allocation
            ? (allocation.entitlement ?? 0) + allocation.carryForward
            : imported
              ? 0
              : type.maxDays;
          const opening = importedLeaveOpening(
            Boolean(allocation),
            imported?.available,
          );
          const unlimitedEntitlement = allocation
            ? policyHasUnlimitedEntitlement(allocation.policySnapshot)
            : !imported && type.unlimitedEntitlement;
          const available = calculateLeaveBalance({
            cap,
            opening,
            credited: 0,
            used,
            pending,
            unlimitedEntitlement,
          }).available;
          const source = leaveBalanceSource(
            Boolean(allocation),
            Boolean(imported),
            unlimitedEntitlement,
          );
          const rule = policy?.rules;
          const fixedEarnedLeaveWarning = Boolean(
            rule &&
            isEarnedLeave(type.code, type.name) &&
            rule.annualEntitlement !== null &&
            !rule.workedDayAccrual,
          );
          return {
            leaveType: type,
            opening,
            credited: allocation ? cap ?? 0 : imported?.credited ?? 0,
            used,
            pending,
            available,
            source,
            importedSnapshot: imported
              ? {
                  throughMonth: imported.periodEnd.toISOString().slice(0, 7),
                  opening: imported.openingBalance,
                  credited: imported.credited,
                  availed: imported.availed,
                  available: imported.available,
                }
              : null,
            fixedEarnedLeaveWarning,
            nextEligibility:
              allocation?.policySnapshot &&
              typeof allocation.policySnapshot === "object" &&
              (allocation.policySnapshot as Record<string, unknown>).accrual &&
              typeof (
                (allocation.policySnapshot as Record<string, unknown>)
                  .accrual as Record<string, unknown>
              ).availableOn === "string"
                ? (
                    (allocation.policySnapshot as Record<string, unknown>)
                      .accrual as Record<string, unknown>
                  ).availableOn
                : null,
            history: relevant.slice(0, 5),
          };
        })
        .filter(
          (balance) => !sourceFilter || Boolean(balance.importedSnapshot),
        ),
    }))
    .filter((row) => row.balances.length > 0);
  const flatBalances = balances.flatMap((row) => row.balances);
  const summary = {
    importedSnapshots: flatBalances.filter(
      (balance) => balance.importedSnapshot,
    ).length,
    policyPeriods: flatBalances.filter(
      (balance) => balance.source === "policy_period",
    ).length,
    leaveTypeAllowances: flatBalances.filter(
      (balance) => balance.source === "leave_type_allowance",
    ).length,
    fixedEarnedLeaveWarnings: flatBalances.filter(
      (balance) => balance.fixedEarnedLeaveWarning,
    ).length,
  };
  return NextResponse.json({
    types,
    balances,
    summary,
    page,
    pageSize: PAGE_SIZE,
    total,
    pages,
    balanceRefreshPending,
  });
}
