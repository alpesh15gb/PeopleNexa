export type AttendanceTally = {
  total: number;
  marked: number;
  livePresent: number;
  liveAbsent: number;
  present: number;
  late: number;
  halfDay: number;
  permission: number;
  onLeave: number;
  absent: number;
  noRecord: number;
};

type AttendanceRow = { employeeId: string; status: string; punchInTime?: Date | null };

/**
 * Produces daily display buckets for an already-scoped employee population.
 * `livePresent` is intentionally independent of finalized attendance status.
 * It is sourced from authorized raw Punch employee IDs so ingestion is visible
 * before reconciliation creates an Attendance row.
 */
export function tallyDailyAttendance(
  employeeIds: Iterable<string>,
  records: Iterable<AttendanceRow>,
  approvedLeaveEmployeeIds: Iterable<string>,
  authorizedPunchEmployeeIds: Iterable<string> = [],
): AttendanceTally {
  const population = new Set(employeeIds);
  const livePresentEmployeeIds = new Set<string>();
  for (const employeeId of authorizedPunchEmployeeIds) {
    if (population.has(employeeId)) livePresentEmployeeIds.add(employeeId);
  }
  const recordByEmployee = new Map<string, AttendanceRow>();
  for (const record of records) {
    if (population.has(record.employeeId)) recordByEmployee.set(record.employeeId, record);
  }
  const onLeaveEmployeeIds = new Set(approvedLeaveEmployeeIds);
  const tally: AttendanceTally = { total: population.size, marked: 0, livePresent: 0, liveAbsent: 0, present: 0, late: 0, halfDay: 0, permission: 0, onLeave: 0, absent: 0, noRecord: 0 };

  for (const employeeId of population) {
    const record = recordByEmployee.get(employeeId);
    const status = record?.status;
    if (livePresentEmployeeIds.has(employeeId)) tally.livePresent++;
    else if (!onLeaveEmployeeIds.has(employeeId)) tally.liveAbsent++;
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
