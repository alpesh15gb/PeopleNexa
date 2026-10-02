import { configurationEffectiveAtISTDay } from "@/lib/configuration";
import { NextResponse } from "next/server";
import { refreshEarnedLeaveBalances } from "@/lib/leave-accrual-refresh";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  calculateLeaveBalance,
  importedLeaveOpening,
  selectLeaveAllocation,
  policyHasUnlimitedEntitlement,
} from "@/lib/leave-balance";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [types, requests, employee] = await Promise.all([
    prisma.leaveType.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        status: { in: ["approved", "pending"] },
      },
      select: {
        leaveTypeId: true,
        days: true,
        status: true,
        fromDate: true,
        leavePolicySnapshot: true,
      },
    }),
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true, branch: { select: { locationId: true } } },
    }),
  ]);
  await prisma.$transaction(
    (tx) => refreshEarnedLeaveBalances(tx, session.tenantId, [session.sub]),
    { isolationLevel: "Serializable" },
  );
  const [policyBalances, importedBalances] = await Promise.all([
    prisma.leavePolicyBalance.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        policyPeriod: {
          effectiveFrom: { lte: configurationEffectiveAtISTDay(new Date()) },
          AND: [
            {
              OR: [
                { effectiveTo: null },
                {
                  effectiveTo: {
                    gte: configurationEffectiveAtISTDay(new Date()),
                  },
                },
              ],
            },
            {
              OR: [
                {
                  locationId:
                    employee?.branch?.locationId ?? employee?.locationId ?? "",
                },
                { locationId: null },
              ],
            },
          ],
        },
      },
      include: { policyPeriod: { select: { locationId: true, id: true } } },
    }),
    prisma.leaveBalanceImportEntry.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: session.sub,
        periodEnd: { lte: new Date() },
      },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  const used = new Map<string, number>();
  for (const r of requests) {
    used.set(r.leaveTypeId, (used.get(r.leaveTypeId) ?? 0) + r.days);
  }

  const balance = types.map((t) => {
    const employeeLocationId =
      employee?.branch?.locationId ?? employee?.locationId;
    const allocated = selectLeaveAllocation(
      policyBalances,
      t.id,
      employee?.branch?.locationId ?? employee?.locationId,
    );
    const policyUsed = allocated
      ? requests
          .filter(
            (request) =>
              request.leaveTypeId === t.id &&
              request.leavePolicySnapshot &&
              typeof request.leavePolicySnapshot === "object" &&
              (request.leavePolicySnapshot as Record<string, unknown>)
                .policyPeriodId === allocated.policyPeriodId,
          )
          .reduce((sum, request) => sum + request.days, 0)
      : 0;
    const imported = importedBalances.find((item) => item.leaveTypeId === t.id);
    const usedDays = imported
      ? requests
          .filter(
            (request) =>
              request.leaveTypeId === t.id &&
              request.fromDate >= imported.periodEnd,
          )
          .reduce((sum, request) => sum + request.days, 0)
      : (used.get(t.id) ?? 0);
    const cap = allocated
      ? (allocated.entitlement ?? 0) + allocated.carryForward
      : imported
        ? 0
        : t.maxDays;
    const unlimitedEntitlement = allocated
      ? policyHasUnlimitedEntitlement(allocated.policySnapshot)
      : !imported && t.unlimitedEntitlement;
    const remaining = calculateLeaveBalance({
      cap,
      opening: importedLeaveOpening(Boolean(allocated), imported?.available),
      credited: 0,
      used: allocated ? policyUsed : usedDays,
      pending: 0,
      unlimitedEntitlement,
    }).available;
    return {
      ...t,
      maxDays: allocated
        ? (allocated.entitlement ?? 0) + allocated.carryForward
        : imported
          ? imported.available
          : t.maxDays,
      used: allocated ? policyUsed : usedDays,
      remaining,
      policyPeriodId: allocated?.policyPeriodId ?? null,
      importedBalance: imported
        ? {
            batchId: imported.batchId,
            throughMonth: imported.periodEnd.toISOString().slice(0, 7),
            opening: imported.openingBalance,
            credited: imported.credited,
            availed: imported.availed,
            available: imported.available,
          }
        : null,
    };
  });

  return NextResponse.json({ balance });
}
