/** Approved half-day leave consumes half a day; attendance describes the other half. */
export function payrollLeaveDay(
  days: number,
  sameDay: boolean,
  paid: boolean,
  attendanceStatus?: string,
) {
  const fraction = sameDay && days === 0.5 ? 0.5 : 1;
  const remaining = 1 - fraction;
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
