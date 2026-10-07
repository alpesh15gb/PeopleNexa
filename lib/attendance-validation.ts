// Shared with reconciliation: spans beyond this limit require human review.
export const MAX_SPAN_HOURS = 14;
export function attendanceRequiresReview(record: { reviewStatus?: string | null; punchInTime: Date | null; punchOutTime: Date | null }) {
  if (record.reviewStatus === "needs_review" || record.reviewStatus === "missed_punch") return true;
  if (!record.punchInTime || !record.punchOutTime) return false;
  const hours = (record.punchOutTime.getTime() - record.punchInTime.getTime()) / 3600000;
  return !Number.isFinite(hours) || hours < 0 || hours > MAX_SPAN_HOURS;
}
