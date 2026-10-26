// Shared with reconciliation: spans beyond this limit require human review.
export const MAX_SPAN_HOURS = 14;
// An undirected device burst is evidence of scanning, not a distinct IN/OUT.
// This is a review guard, not a minimum paid shift or a deduplication rule.
export const UNKNOWN_PAIR_REVIEW_SECONDS = 120;
export function isAmbiguousPunchBurst(punches: Array<{ inOutHint: string; punchTime: Date }>) {
  const directedPair = punches.some(p => p.inOutHint === "in") && punches.some(p => p.inOutHint === "out");
  if (punches.length < 2 || directedPair) return false;
  const times = punches.map(p => p.punchTime.getTime());
  return Math.max(...times) - Math.min(...times) <= UNKNOWN_PAIR_REVIEW_SECONDS * 1000;
}
export function attendanceRequiresReview(record: { reviewStatus?: string | null; punchInTime: Date | null; punchOutTime: Date | null }) {
  if (record.reviewStatus === "needs_review" || record.reviewStatus === "missed_punch") return true;
  if (!record.punchInTime || !record.punchOutTime) return false;
  const hours = (record.punchOutTime.getTime() - record.punchInTime.getTime()) / 3600000;
  return !Number.isFinite(hours) || hours < 0 || hours > MAX_SPAN_HOURS;
}
