import { attendanceRequiresReview } from "./attendance-validation";
import { istDateKey } from "./ist";

export type AssessedStatus = "present" | "late" | "permission" | "half_day" | "absent" | "pending" | "needs_review" | "upcoming" | "not_employed" | "on_leave" | "holiday" | "weekly_off";
export type AssessedRecord = { status: string; reviewStatus?: string | null; punchInTime: Date | null; punchOutTime: Date | null };
export const assessmentCodes: Record<AssessedStatus, string> = {
  present: "P", late: "P", permission: "P", half_day: "½P", absent: "A", pending: "Pending", needs_review: "Review", upcoming: "Upcoming", not_employed: "—", on_leave: "L", holiday: "H", weekly_off: "WO",
};

/** Read-only classification shared by attendance screens and exports.
 * Scan presence is a separate fact and never changes a stored decision.
 */
export function assessAttendanceDay(args: {
  day: string; asOfDay?: string; joiningDate?: Date | null; record?: AssessedRecord | null;
  hasShift?: boolean; hasUnprocessedSource?: boolean; hasAuthorizedPunch?: boolean; holiday?: boolean; leave?: boolean; weeklyOff?: boolean;
}) {
  const asOfDay = args.asOfDay ?? istDateKey(new Date());
  let status: AssessedStatus;
  if (args.day > asOfDay) status = "upcoming";
  else if (args.joiningDate && args.day < istDateKey(args.joiningDate)) status = "not_employed";
  else if (args.record && assessmentRequiresReview(args.record, args.hasShift)) status = "needs_review";
  else if (args.record && ["present", "late", "permission", "half_day"].includes(args.record.status)) status = args.record.status as AssessedStatus;
  else if (args.record?.reviewStatus === "manual_override") status = args.record.status as AssessedStatus;
  else if (!args.record && (args.hasAuthorizedPunch || args.hasUnprocessedSource)) status = "pending";
  else if (args.holiday) status = "holiday";
  else if (args.leave) status = "on_leave";
  else if (args.weeklyOff) status = "weekly_off";
  else if (args.record) status = args.record.status === "absent" ? "absent" : "pending";
  else status = args.day === asOfDay ? "pending" : "absent";
  return { status, code: assessmentCodes[status], requiresReview: status === "needs_review", assessedPresent: ["present", "late", "permission", "half_day"].includes(status) };
}

export function assessmentRequiresReview(record: AssessedRecord, hasShift = true): boolean {
  return attendanceRequiresReview(record) || Boolean(!hasShift && record.punchInTime && record.punchOutTime && istDateKey(record.punchInTime) !== istDateKey(record.punchOutTime));
}

/** Verified work duration, rather than an unconditional difference of clocks. */
export function assessedWorkingMinutes(record: AssessedRecord, hasShift = true): number | null {
  if (assessmentRequiresReview(record, hasShift) || !record.punchInTime || !record.punchOutTime) return null;
  if (!hasShift && istDateKey(record.punchInTime) !== istDateKey(record.punchOutTime)) return null;
  return Math.max(0, Math.round((record.punchOutTime.getTime() - record.punchInTime.getTime()) / 60_000));
}

export function isAttendanceHoliday(day: string, holidays: { date: Date; isRecurring: boolean }[]) {
  return holidays.some(h => h.isRecurring ? istDateKey(h.date).slice(5) === day.slice(5) : istDateKey(h.date) === day);
}
export function isScheduledWeeklyOff(day: string, shift?: { sundayWeeklyOff?: boolean } | null) {
  return shift?.sundayWeeklyOff === true && new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
}
