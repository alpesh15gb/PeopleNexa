import { round2 } from "./utils";
import { dayRangeIST } from "./dates";
import { istDateKey } from "./ist";

export interface FandFSummary {
  grossMonthly: number;
  perDay: number;
  earnedDays: number;
  earnedSalary: number;
  noticeDaysGiven: number;
  noticeShortfallDays: number;
  noticeDeduction: number;
  loanOutstanding: number;
  encashmentDays: number;
  encashmentAmount: number;
  unpaidLeaveDeduction: number;
  finalAmount: number;
}

/**
 * Compute a transparent full & final settlement:
 *  - earned salary for days worked in the last month (perDay × calendar days up to LWD)
 *  - notice-period shortfall deduction (perDay × missing notice days)
 *  - outstanding loan/advance recovery
 *  - leave encashment (unused encashable balance × per-day pay)
 *  - unpaid leave days between LWD and month end (no show) are NOT charged by default
 */
export function computeFandF(input: {
  grossMonthly: number;
  resignationDate: Date;
  lastWorkingDay: Date;
  noticeDays: number;
  loanOutstanding: number;
  encashmentDays?: number; // unused encashable leave balance
}): FandFSummary {
  // grossMonthly already contains basic+HRA+allowances — do NOT add PF on top.
  const monthly = Math.max(0, input.grossMonthly);

  // Days worked in the final month: 1st of the LWD month → LWD inclusive.
  const lastWorkingDay = istDateKey(input.lastWorkingDay);
  const [year, month, day] = lastWorkingDay.split("-").map(Number);
  // Per-day rate uses the actual calendar days in the LWD month (28–31), not a fixed 30.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const perDay = round2(monthly / daysInMonth);

  const earnedDays = day;
  // Cap earned salary at one full month.
  const earnedSalary = Math.min(round2(perDay * earnedDays), monthly);

  const lastDayStart = dayRangeIST(lastWorkingDay).start;
  const resignationStart = dayRangeIST(istDateKey(input.resignationDate)).start;
  const noticeDaysGiven = Math.max(0, (lastDayStart.getTime() - resignationStart.getTime()) / 86_400_000);
  const noticeShortfallDays = Math.max(0, input.noticeDays - noticeDaysGiven);
  const noticeDeduction = round2(perDay * noticeShortfallDays);

  const encashmentDays = Math.max(0, round2(input.encashmentDays ?? 0));
  const encashmentAmount = round2(perDay * encashmentDays);

  const finalAmount = Math.max(0, round2(earnedSalary + encashmentAmount - noticeDeduction - input.loanOutstanding));

  return {
    grossMonthly: monthly,
    perDay,
    earnedDays,
    earnedSalary,
    noticeDaysGiven,
    noticeShortfallDays,
    noticeDeduction,
    loanOutstanding: input.loanOutstanding,
    encashmentDays,
    encashmentAmount,
    unpaidLeaveDeduction: 0,
    finalAmount,
  };
}
