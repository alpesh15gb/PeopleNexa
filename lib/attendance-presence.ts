import { istDateKey } from "./ist";

export const AUTHORIZED_PUNCH_STATUSES = ["auto", "approved"] as const;

/** Raw Punch rows that count toward real-time presence for an IST day. */
export function authorizedPunchDayFilter(start: Date, end: Date) {
  return {
    punchTime: { gte: start, lt: end },
    authStatus: { in: [...AUTHORIZED_PUNCH_STATUSES] },
  };
}

type AttendancePresenceRow = { employeeId: string; date: Date; status: string };
type RawPunchPresenceRow = { employeeId: string; punchTime: Date; authStatus: string };

/**
 * Dashboard present numerators include finalized present-like records and any
 * authorized raw punch. Sets ensure repeated scans count an employee once per
 * IST day while status-specific finalized metrics remain independent.
 */
export function dailyPresentEmployeeCounts(
  attendanceRows: Iterable<AttendancePresenceRow>,
  punchRows: Iterable<RawPunchPresenceRow>,
) {
  const employeeIdsByDay = new Map<string, Set<string>>();
  const add = (day: Date, employeeId: string) => {
    const key = istDateKey(day);
    const employeeIds = employeeIdsByDay.get(key) ?? new Set<string>();
    employeeIds.add(employeeId);
    employeeIdsByDay.set(key, employeeIds);
  };

  for (const row of attendanceRows) {
    if (row.status === "present" || row.status === "late" || row.status === "half_day") add(row.date, row.employeeId);
  }
  for (const row of punchRows) {
    if ((AUTHORIZED_PUNCH_STATUSES as readonly string[]).includes(row.authStatus)) add(row.punchTime, row.employeeId);
  }

  return new Map([...employeeIdsByDay].map(([day, employeeIds]) => [day, employeeIds.size]));
}
