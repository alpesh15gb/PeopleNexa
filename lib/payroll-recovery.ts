import type { PayrollAttendanceTreatment } from "./configuration";

export function recoveredMissingOutStatus(treatment: PayrollAttendanceTreatment["missingOutPunch"], currentStatus: string): string {
  if (treatment === "half_day") return "half_day";
  if (treatment === "full_day") return "absent";
  return currentStatus;
}

export function isFinalizedInOnlyDay(record: { finalized: boolean; punchInTime: Date | null; punchOutTime: Date | null; reviewStatus: string | null }): boolean {
  return record.finalized && Boolean(record.punchInTime) && !record.punchOutTime && record.reviewStatus === "missed_punch";
}
