import type { PayrollAttendanceTreatment } from "./configuration";

export function recoveredMissingOutStatus(treatment: PayrollAttendanceTreatment["missingOutPunch"], currentStatus: string): string {
  if (treatment === "half_day") return "half_day";
  if (treatment === "full_day") return "absent";
  return currentStatus;
}

export function isFinalizedInOnlyDay(record: { finalized: boolean; punchInTime: Date | null; punchOutTime: Date | null; reviewStatus: string | null }): boolean {
  // Older finalizers did not persist missed_punch. Keep explicit manual
  // overrides authoritative while allowing those legacy derived rows to recover.
  return record.finalized && Boolean(record.punchInTime) && !record.punchOutTime && (record.reviewStatus === "missed_punch" || record.reviewStatus === null);
}
