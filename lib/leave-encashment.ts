import type { Prisma } from "@/generated/prisma/client";
import { configurationEffectiveAtISTDay } from "./configuration";
import { calculateLeaveBalance, selectLeaveAllocation, policyHasUnlimitedEntitlement } from "./leave-balance";
import { leavePolicyDraft } from "./configuration";
import { earnedLeaveForPeriod } from "./leave-accrual";
import { dayRangeIST } from "./dates";

/** Allocation > imported opening > legacy allowance; pending leave stays reserved. */
export async function encashableLeaveAt(tx: Prisma.TransactionClient, tenantId: string, employeeId: string, at: Date) {
  const employee = await tx.employee.findFirst({ where: { tenantId, id: employeeId }, select: { locationId: true, branch: { select: { locationId: true } } } });
  if (!employee) throw new Error("Employee not found for leave settlement.");
  const locationId = employee.branch?.locationId ?? employee.locationId;
  const [types, requests, allocations, imports] = await Promise.all([
    tx.leaveType.findMany({ where: { tenantId, encashable: true } }),
    tx.leaveRequest.findMany({ where: { tenantId, employeeId, status: { in: ["approved", "pending"] } } }),
    tx.leavePolicyBalance.findMany({ where: { tenantId, employeeId, policyPeriod: { effectiveFrom: { lte: configurationEffectiveAtISTDay(at) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: configurationEffectiveAtISTDay(at) } }] } }, include: { policyPeriod: true } }),
    tx.leaveBalanceImportEntry.findMany({ where: { tenantId, employeeId, periodEnd: { lte: at } }, orderBy: { periodEnd: "desc" } }),
  ]);
  const ledger = await Promise.all(types.map(async (type) => {
    const allocation = selectLeaveAllocation(allocations, type.id, locationId);
    const imported = allocation ? null : imports.find((row) => row.leaveTypeId === type.id);
    let entitlement = allocation?.entitlement;
    const rule = leavePolicyDraft({ leaveTypes: [(allocation?.policySnapshot as { rules?: unknown } | null)?.rules] })?.leaveTypes[0];
    if (allocation && rule?.workedDayAccrual) {
      const cutoff = new Date(Math.min(at.getTime(), Date.now()));
      const attendance = await tx.attendance.findMany({ where: { tenantId, employeeId, date: { gte: dayRangeIST(allocation.policyPeriod.effectiveFrom.toISOString().slice(0, 10)).start, lte: cutoff } }, select: { date: true, status: true } });
      const worker = await tx.employee.findFirst({ where: { id: employeeId, tenantId }, select: { joiningDate: true } });
      entitlement = earnedLeaveForPeriod(rule.workedDayAccrual, attendance, worker?.joiningDate ?? null, allocation.policyPeriod.effectiveFrom, allocation.policyPeriod.effectiveTo, cutoff).entitlement;
    }
    const committed = requests.filter((row) => row.leaveTypeId === type.id && (allocation ? (row.leavePolicySnapshot as { policyPeriodId?: string } | null)?.policyPeriodId === allocation.policyPeriodId : !imported || row.fromDate >= imported.periodEnd)).reduce((sum, row) => sum + row.days, 0);
    const unlimited = allocation ? policyHasUnlimitedEntitlement(allocation.policySnapshot) : !imported && type.unlimitedEntitlement;
    const available = calculateLeaveBalance({ cap: allocation ? (entitlement ?? 0) + allocation.carryForward : imported ? 0 : type.maxDays, opening: imported?.available ?? 0, credited: 0, used: committed, pending: 0, unlimitedEntitlement: unlimited }).available;
    // Unlimited entitlement is not an unlimited cash liability.
    return { leaveTypeId: type.id, code: type.code, days: available ?? 0, source: allocation ? "policy_period" : imported ? "imported_snapshot" : "leave_type_allowance" };
  }));
  return { days: ledger.reduce((sum, row) => sum + row.days, 0), ledger };
}
