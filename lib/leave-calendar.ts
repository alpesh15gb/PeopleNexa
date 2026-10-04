import { istDateKey } from "./ist";

export type LeaveCalendarRules = {
  dayCounting?: "calendar_days" | "working_days" | "sandwich";
  weeklyOffDays?: number[];
  noticeDays?: number;
  minServiceDays?: number;
  requiresReason?: boolean;
  maxConsecutiveDays?: number | null;
};

const DAY = 86_400_000;
export function leaveCalendar(from: string, to: string, rules: LeaveCalendarRules, holidays: Array<{ date: Date; isRecurring: boolean; isHalfDay: boolean }>, halfDay = false) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start >= 366 * DAY) throw new Error("Invalid leave date range.");
  if (halfDay && from !== to) throw new Error("Half-day leave must be for a single date.");
  const rows: Array<{ date: string; fraction: number }> = [];
  for (let time = start; time <= end; time += DAY) {
    const date = new Date(time).toISOString().slice(0, 10);
    const holiday = holidays.filter((h) => h.isRecurring ? istDateKey(h.date).slice(5) === date.slice(5) : istDateKey(h.date) === date);
    const off = (rules.weeklyOffDays ?? []).includes(new Date(time).getUTCDay());
    const fraction = off || holiday.some((h) => !h.isHalfDay) ? 0 : holiday.length ? 0.5 : 1;
    rows.push({ date, fraction });
  }
  const working = rows.filter((r) => r.fraction > 0);
  const chargeableDays: Record<string, number> = {};
  const nonWorkingFractions: Record<string, number> = {};
  for (const row of rows) {
    let fraction = rules.dayCounting === "calendar_days" || !rules.dayCounting ? 1 : row.fraction;
    // Sandwich applies only to non-working days enclosed by working leave dates.
    if (rules.dayCounting === "sandwich" && working.length && row.date > working[0].date && row.date < working[working.length - 1].date) fraction = 1;
    if (halfDay) fraction = Math.min(fraction, 0.5);
    chargeableDays[row.date] = fraction;
    nonWorkingFractions[row.date] = rules.dayCounting === "working_days" || rules.dayCounting === "sandwich" ? 1 - row.fraction : 0;
  }
  return { chargeableDays, nonWorkingFractions, days: Object.values(chargeableDays).reduce((sum, days) => sum + days, 0) };
}

export function leaveEligibilityError(rules: LeaveCalendarRules, from: string, days: number, joiningDate: Date | null, reason: string, now = new Date()) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const today = Date.parse(`${istDateKey(now)}T00:00:00Z`);
  if (rules.requiresReason && !reason.trim()) return "A reason is required for this leave type.";
  if ((rules.noticeDays ?? 0) > 0 && start - today < rules.noticeDays! * DAY) return `Apply at least ${rules.noticeDays} day(s) before the leave starts.`;
  if (joiningDate && start < Date.parse(`${istDateKey(joiningDate)}T00:00:00Z`) + (rules.minServiceDays ?? 0) * DAY) return `This leave cannot start before joining or the ${rules.minServiceDays ?? 0}-day service requirement.`;
  if (rules.maxConsecutiveDays != null && days > rules.maxConsecutiveDays) return `This leave type allows at most ${rules.maxConsecutiveDays} days per request.`;
  return null;
}

/** Undefined preserves pre-calendar snapshots. Zero explicitly excludes this day. */
export function snapshottedLeaveFraction(snapshot: unknown, date: string): number | undefined {
  const calendar = (snapshot as { calendar?: { chargeableDays?: Record<string, unknown> } } | null)?.calendar;
  if (!calendar?.chargeableDays) return undefined;
  const fraction = calendar.chargeableDays[date];
  if (fraction === 0 || fraction === 0.5 || fraction === 1) return fraction;
  throw new Error(`Leave snapshot has no valid day fraction for ${date}.`);
}
