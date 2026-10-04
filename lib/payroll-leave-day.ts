/** Approved half-day leave consumes half a day; attendance describes the other half. */
export function payrollLeaveDay(
  days: number,
  sameDay: boolean,
  paid: boolean,
  attendanceStatus?: string,
  snapshottedFraction?: number,
  nonWorkingFraction = 0,
) {
  const fraction = snapshottedFraction ?? (sameDay && days === 0.5 ? 0.5 : 1);
  const remaining = Math.max(0, 1 - fraction - nonWorkingFraction);
  const attended = ["present", "late", "permission", "half_day"].includes(
    attendanceStatus ?? "",
  );
  return {
    onLeaveDays: fraction,
    paidLeaveDays: paid ? fraction : 0,
    unpaidLeaveDays: paid ? 0 : fraction,
    workingDays: remaining,
    presentDays: attended && attendanceStatus !== "late" ? remaining : 0,
    lateDays: attendanceStatus === "late" ? remaining : 0,
    absentDays: attended ? 0 : remaining,
  };
}
