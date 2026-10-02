import type { Prisma } from "@/generated/prisma/client";
import {
  leavePolicyDraft,
  configurationEffectiveAtISTDay,
} from "@/lib/configuration";
import { earnedLeaveForPeriod } from "@/lib/leave-accrual";
import { dayRangeIST } from "@/lib/dates";

/** Called within the balance/request transaction so corrections and reservations stay consistent. */
export async function refreshEarnedLeaveBalances(
  db: Prisma.TransactionClient,
  tenantId: string,
  employeeIds: string[],
  now = new Date(),
) {
  if (!employeeIds.length) return;
  const balances = await db.leavePolicyBalance.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      policyPeriod: {
        effectiveFrom: { lte: configurationEffectiveAtISTDay(now) },
      },
    },
    include: {
      policyPeriod: true,
      employee: { select: { joiningDate: true } },
    },
  });
  const earned = balances.flatMap((balance) => {
    const snapshot = balance.policySnapshot as Record<string, unknown> | null;
    const rules = snapshot?.rules;
    const rule = leavePolicyDraft({ leaveTypes: [rules] })?.leaveTypes[0];
    return rule?.workedDayAccrual
      ? [{ balance, snapshot: snapshot!, rule: rule.workedDayAccrual }]
      : [];
  });
  if (!earned.length) return;
  const start = new Date(
    Math.min(
      ...earned.map(({ balance }) =>
        dayRangeIST(
          balance.policyPeriod.effectiveFrom.toISOString().slice(0, 10),
        ).start.getTime(),
      ),
    ),
  );
  const attendance = await db.attendance.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      date: { gte: start, lte: now },
    },
    select: { employeeId: true, date: true, status: true },
  });
  for (const { balance, snapshot, rule } of earned) {
    const value = earnedLeaveForPeriod(
      rule,
      attendance.filter((row) => row.employeeId === balance.employeeId),
      balance.employee.joiningDate,
      balance.policyPeriod.effectiveFrom,
      balance.policyPeriod.effectiveTo,
      now,
    );
    const deferred = value.months.find(
      (month) => month.accrued > 0 && new Date(month.availableOn) > now,
    );
    const accrual = {
      months: value.months,
      accrued: value.entitlement,
      availableOn:
        deferred?.availableOn ??
        balance.policyPeriod.effectiveFrom.toISOString(),
    };
    const next = { ...snapshot, accrual };
    if (
      balance.entitlement !== value.entitlement ||
      JSON.stringify(snapshot.accrual) !== JSON.stringify(accrual)
    )
      await db.leavePolicyBalance.update({
        where: { id: balance.id },
        data: {
          entitlement: value.entitlement,
          policySnapshot: next as Prisma.InputJsonValue,
        },
      });
  }
}
