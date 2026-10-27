/** Describe the source recorded in the payslips of one payroll run. */
export type PayrollAttendanceSource = "automatic" | "manual" | "mixed" | "unknown";

export function payrollAttendanceSource(snapshots: readonly unknown[]): PayrollAttendanceSource {
  if (!snapshots.length) return "unknown";
  const sources = new Set<string>();
  let unknown = false;
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      unknown = true;
      continue;
    }
    const input = snapshot as { manualAttendance?: unknown; attendance?: unknown };
    if (input.manualAttendance !== undefined) {
      const manual = input.manualAttendance as { uploadId?: unknown } | null;
      if (manual && typeof manual.uploadId === "string" && manual.uploadId.trim()) sources.add(`manual:${manual.uploadId}`);
      else unknown = true;
    } else if (input.attendance && typeof input.attendance === "object" && !Array.isArray(input.attendance)) {
      sources.add("automatic");
    } else {
      unknown = true;
    }
  }
  if (sources.size > 1) return "mixed";
  if (unknown || sources.size === 0) return "unknown";
  return sources.has("automatic") ? "automatic" : "manual";
}
