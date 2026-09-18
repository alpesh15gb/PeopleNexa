export type AttendanceTally = {
  total: number;
  marked: number;
  present: number;
  late: number;
  halfDay: number;
  permission: number;
  onLeave: number;
  absent: number;
  noRecord: number;
};

type AttendanceRow = { employeeId: string; status: string };

/**
 * Produces mutually exclusive daily display buckets for an already-scoped
 * employee population. An explicit attendance record always wins over leave.
 */
export function tallyDailyAttendance(
  employeeIds: Iterable<string>,
  records: Iterable<AttendanceRow>,
  approvedLeaveEmployeeIds: Iterable<string>,
): AttendanceTally {
  const population = new Set(employeeIds);
  const recordByEmployee = new Map<string, string>();
  for (const record of records) {
    if (population.has(record.employeeId)) recordByEmployee.set(record.employeeId, record.status);
  }
  const onLeaveEmployeeIds = new Set(approvedLeaveEmployeeIds);
  const tally: AttendanceTally = { total: population.size, marked: 0, present: 0, late: 0, halfDay: 0, permission: 0, onLeave: 0, absent: 0, noRecord: 0 };

  for (const employeeId of population) {
    const status = recordByEmployee.get(employeeId);
    if (status === "present") { tally.present++; tally.marked++; }
    else if (status === "late") { tally.late++; tally.marked++; }
    else if (status === "half_day") { tally.halfDay++; tally.marked++; }
    else if (status === "permission") { tally.permission++; tally.marked++; }
    else if (status === "absent") { tally.absent++; tally.marked++; }
    else if (onLeaveEmployeeIds.has(employeeId)) tally.onLeave++;
    else tally.noRecord++;
  }
  return tally;
}
