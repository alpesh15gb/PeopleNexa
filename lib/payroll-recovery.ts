import { payrollPolicyDraft, type PayrollAttendanceTreatment } from "./configuration";

export function legacyMessComponentCodes(policies: { payload: unknown }[]) {
  return [...new Set(policies.flatMap(({ payload }) => payrollPolicyDraft(payload)?.components ?? [])
    .filter((component) => component.applicability === "assigned_employees" && /mess/i.test(`${component.code} ${component.label}`))
    .map((component) => component.code))];
}

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
