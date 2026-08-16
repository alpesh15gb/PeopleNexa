import { round2 } from "./utils";
import { daysBetween, startOfDay } from "./dates";

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
  const perDay = round2(input.grossMonthly / 30);

  // Days worked in the final month: 1st of the LWD month → LWD inclusive.
  const lwd = startOfDay(input.lastWorkingDay);
  const monthStart = new Date(lwd.getFullYear(), lwd.getMonth(), 1);
  const earnedDays = daysBetween(monthStart, lwd);
  const earnedSalary = round2(perDay * earnedDays);

  const noticeDaysGiven = daysBetween(input.resignationDate, input.lastWorkingDay);
  const noticeShortfallDays = Math.max(0, input.noticeDays - noticeDaysGiven);
  const noticeDeduction = round2(perDay * noticeShortfallDays);

  const encashmentDays = Math.max(0, Math.floor(input.encashmentDays ?? 0));
  const encashmentAmount = round2(perDay * encashmentDays);

  const finalAmount = round2(earnedSalary + encashmentAmount - noticeDeduction - input.loanOutstanding);

  return {
    grossMonthly: input.grossMonthly,
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
