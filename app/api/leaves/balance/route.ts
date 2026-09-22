import { NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { periodBalance } from "@/lib/leave-policy-period";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [types, requests, employee] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub, status: { in: ["approved", "pending"] } },
      select: { leaveTypeId: true, days: true, status: true, fromDate: true, leavePolicySnapshot: true },
    }),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branch: { select: { locationId: true } } } }),
  ]);
  const [policyBalances, importedBalances] = await Promise.all([
    prisma.leavePolicyBalance.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, policyPeriod: { effectiveFrom: { lte: new Date() }, AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, { OR: [{ locationId: employee?.branch?.locationId ?? "" }, { locationId: null }] }] } }, include: { policyPeriod: { select: { locationId: true, id: true } } } }),
    prisma.leaveBalanceImportEntry.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, periodEnd: { lte: new Date() } }, orderBy: { periodEnd: "desc" } }),
  ]);

  const used = new Map<string, number>();
  for (const r of requests) {
    used.set(r.leaveTypeId, (used.get(r.leaveTypeId) ?? 0) + r.days);
  }

  const balance = types.map((t) => {
    const allocated = policyBalances.filter((item) => item.leaveTypeId === t.id).sort((a, b) => Number(b.policyPeriod.locationId === employee?.branch?.locationId) - Number(a.policyPeriod.locationId === employee?.branch?.locationId))[0];
    const policyUsed = allocated ? requests.filter((request) => request.leaveTypeId === t.id && request.leavePolicySnapshot && typeof request.leavePolicySnapshot === "object" && (request.leavePolicySnapshot as Record<string, unknown>).policyPeriodId === allocated.policyPeriodId).reduce((sum, request) => sum + request.days, 0) : 0;
    const imported = importedBalances.find((item) => item.leaveTypeId === t.id);
    const usedDays = imported ? requests.filter((request) => request.leaveTypeId === t.id && request.fromDate >= imported.periodEnd).reduce((sum, request) => sum + request.days, 0) : used.get(t.id) ?? 0;
    return {
      ...t,
      maxDays: allocated ? allocated.entitlement + allocated.carryForward : imported ? imported.available : t.maxDays,
      used: allocated ? policyUsed : usedDays,
      remaining: allocated ? periodBalance(allocated.entitlement, allocated.carryForward, policyUsed) : imported ? Math.max(imported.available - usedDays, 0) : Math.max(t.maxDays - usedDays, 0),
      policyPeriodId: allocated?.policyPeriodId ?? null,
      importedBalance: imported ? { batchId: imported.batchId, throughMonth: imported.periodEnd.toISOString().slice(0, 7), opening: imported.openingBalance, credited: imported.credited, availed: imported.availed, available: imported.available } : null,
    };
  });

  return NextResponse.json({ balance });
}
