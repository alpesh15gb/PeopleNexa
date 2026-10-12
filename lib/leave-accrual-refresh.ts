import type { Prisma } from "@/generated/prisma/client";
import {
  leavePolicyDraft,
  configurationEffectiveAtISTDay,
} from "@/lib/configuration";
import { earnedLeaveForPeriod } from "@/lib/leave-accrual";
import { dayRangeIST } from "@/lib/dates";
import { earnedFromWorkDays, type ReviewedAttendanceRow } from "./payroll-attendance-import";
import { isEarnedLeave } from "./leave-balance";

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
      ? [{ balance, snapshot: snapshot!, rule: rule.workedDayAccrual, manualEligible: isEarnedLeave(rule.code, rule.name) }]
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
  const manualCredits = await db.payrollAttendanceCredit.findMany({ where: { tenantId, employeeId: { in: employeeIds }, active: true }, orderBy: { month: "asc" } });
  const manualImports = manualCredits.length ? await db.payrollAttendanceImport.findMany({ where: { tenantId, id: { in: [...new Set(manualCredits.map(item => item.uploadId))] } }, select: { id: true, reviewedRows: true } }) : [];
  for (const { balance, snapshot, rule, manualEligible } of earned) {
    const value = earnedLeaveForPeriod(
      rule,
      attendance.filter((row) => row.employeeId === balance.employeeId),
      balance.employee.joiningDate,
      balance.policyPeriod.effectiveFrom,
      balance.policyPeriod.effectiveTo,
      now,
    );
    // A finalized client attendance month replaces biometric accrual for that
    // month. It is never added on top of the automatic worked-day credit.
    for (const credit of manualCredits.filter(item => manualEligible && item.employeeId === balance.employeeId)) {
      const index = value.months.findIndex(item => item.month === credit.month);
      if (index < 0) continue;
      const sourceRows = manualImports.find(item => item.id === credit.uploadId)?.reviewedRows as unknown as ReviewedAttendanceRow[] | undefined;
      const sourceRow = sourceRows?.find(item => item.employeeId === balance.employeeId && !item.excluded);
      if (!sourceRow) throw new Error("Finalized attendance credit is missing its source row.");
      const eligibleWorkDays = sourceRow.marks.filter((mark, day) => {
        const key = `${credit.month}-${String(day + 1).padStart(2, "0")}`;
        return (mark === "P" || mark === "OD") && key >= balance.policyPeriod.effectiveFrom.toISOString().slice(0, 10) && (!balance.policyPeriod.effectiveTo || key <= balance.policyPeriod.effectiveTo.toISOString().slice(0, 10));
      }).length;
      value.months[index] = { month: credit.month, workedDays: eligibleWorkDays, accrued: earnedFromWorkDays(eligibleWorkDays), availableOn: credit.availableOn.toISOString(), deferred: true };
    }
    value.entitlement = value.months.filter(item => new Date(item.availableOn) <= now).reduce((sum, item) => sum + item.accrued, 0);
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
