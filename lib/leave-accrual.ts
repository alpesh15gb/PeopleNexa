import { dayRangeIST, monthKeyIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import type { WorkedDayAccrual } from "@/lib/configuration";

export type AttendanceDay = { date: Date; status: string };

/** Attendance-status source: present, late and permission count as one worked day; half_day counts as 0.5. */
export function workedDaysForMonth(
  rows: AttendanceDay[],
  month: string,
): number {
  return rows.reduce((days, row) => {
    if (istDateKey(row.date).slice(0, 7) !== month) return days;
    if (["present", "late", "permission"].includes(row.status)) return days + 1;
    return row.status === "half_day" ? days + 0.5 : days;
  }, 0);
}

export function monthlyWorkedDayAccrual(
  rule: WorkedDayAccrual,
  workedDays: number,
  joiningDate: Date | null,
  month: string,
) {
  const accrued =
    rule.tiers.find(
      (tier) =>
        Math.floor(workedDays) >= tier.minDays &&
        Math.floor(workedDays) <= tier.maxDays,
    )?.daysEarned ?? 0;
  const joiningMonth = joiningDate
    ? istDateKey(joiningDate).slice(0, 7) === month
    : false;
  const availableMonth =
    joiningMonth && rule.joiningMonthClaimDeferral === "next_month"
      ? nextMonth(month)
      : month;
  const { start } = dayRangeIST(`${availableMonth}-01`);
  return {
    workedDays,
    accrued,
    availableOn: start,
    deferred: availableMonth !== month,
  };
}

export function currentAccrualMonth(now = new Date()) {
  return monthKeyIST(now);
}

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}`;
}

/** Recompute earned entitlement from bounded attendance, without crediting future work. */
export function earnedLeaveForPeriod(
  rule: WorkedDayAccrual,
  rows: AttendanceDay[],
  joiningDate: Date | null,
  start: Date,
  end: Date | null,
  now = new Date(),
) {
  const until = new Date(
    Math.min(now.getTime(), end?.getTime() ?? now.getTime()),
  );
  const eligible = rows.filter(
    (row) =>
      istDateKey(row.date) >= start.toISOString().slice(0, 10) &&
      row.date <= until &&
      (!end || istDateKey(row.date) <= end.toISOString().slice(0, 10)) &&
      (!joiningDate || istDateKey(row.date) >= istDateKey(joiningDate)),
  );
  const months: Array<{
    month: string;
    workedDays: number;
    accrued: number;
    availableOn: string;
    deferred: boolean;
  }> = [];
  for (
    let month = start.toISOString().slice(0, 7);
    month <= monthKeyIST(until);
    month = nextMonth(month)
  ) {
    const value = monthlyWorkedDayAccrual(
      rule,
      workedDaysForMonth(eligible, month),
      joiningDate,
      month,
    );
    months.push({
      month,
      ...value,
      availableOn: value.availableOn.toISOString(),
    });
  }
  return {
    entitlement: months
      .filter((value) => new Date(value.availableOn) <= now)
      .reduce((sum, value) => sum + value.accrued, 0),
    months,
  };
}
