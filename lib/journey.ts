import { prisma } from "./prisma";
import { attendanceDayForPunch, shiftForEmployeeDay, shiftWindow, FINALIZE_GRACE_HOURS } from "./reconcile";
import { minutesOfDay } from "./dates";

export function dutyTrackingActive(record: { punchInTime: Date | null; punchOutTime: Date | null } | null, now: Date, window: { start: Date; end: Date }, pendingOut = false) {
  return Boolean(record?.punchInTime && record.punchInTime <= now && !record.punchOutTime && !pendingOut && now >= window.start && now <= window.end);
}

/**
 * Journey tracking privacy guard.
 *
 * Location pings are ONLY accepted while the employee is genuinely on duty:
 *   • there is an open attendance session today (clocked in, not clocked out), AND
 *   • the current time is inside the shift window plus a short grace period.
 *
 * Everything after punch-out or outside the window is rejected server-side, so
 * an employer never collects (or can ever replay) where an employee is at home
 * or off duty. This is the enforcement half of the product's work-hours-only
 * tracking policy.
 */
export async function trackingState(tenantId: string, employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { shift: true },
  });
  if (!employee || employee.tenantId !== tenantId || employee.status !== "active" || employee.loginOnly) {
    return { active: false, reason: "no_employee" as const, record: null, window: null };
  }

  const now = new Date();
  const workDay = await attendanceDayForPunch(employee, now);
  const shift = await shiftForEmployeeDay(employee, workDay);
  const { start, end: fallbackEnd } = shiftWindow(workDay, shift);
  const end = shift ? new Date(workDay.getTime() + minutesOfDay(shift.endTime) * 60000 + (shift.isNightShift || minutesOfDay(shift.endTime) <= minutesOfDay(shift.startTime) ? 86400000 : 0)) : fallbackEnd;
  const graceMs = FINALIZE_GRACE_HOURS * 3600 * 1000;
  const inWindow = now.getTime() >= start.getTime() && now.getTime() <= end.getTime() + graceMs;

  const record = await prisma.attendance.findFirst({
    where: { tenantId, employeeId, date: workDay },
  });
  const pendingOut = await prisma.punch.findFirst({ where: { tenantId, employeeId, source: "mobile", authStatus: "pending", inOutHint: "out", punchTime: { gte: start, lt: new Date(end.getTime() + graceMs) } }, select: { id: true } });
  const openSession = Boolean(record?.punchInTime && record.punchInTime <= now && !record.punchOutTime && !pendingOut);

  return {
    active: dutyTrackingActive(record, now, { start, end: new Date(end.getTime() + graceMs) }, Boolean(pendingOut)),
    reason: !inWindow ? ("outside_work_hours" as const) : !openSession ? ("not_clocked_in" as const) : ("ok" as const),
    record,
    window: { start, end },
  };
}

/** Clip a list of pings to the employee's on-duty span (punch-in → punch-out). */
export function clipToDuty(
  points: { lat: number; lng: number; at: string; accuracy?: number | null }[],
  record: { punchInTime: Date | null; punchOutTime: Date | null } | null,
  window: { start: Date; end: Date } | null
): { lat: number; lng: number; at: string; accuracy?: number | null }[] {
  const PAD_MS = 15 * 60 * 1000; // small buffer so the commute onto duty still shows
  const lower = record?.punchInTime ? record.punchInTime.getTime() - PAD_MS : window?.start.getTime() ?? -Infinity;
  const upper = record?.punchOutTime ? record.punchOutTime.getTime() + PAD_MS : window?.end.getTime() ?? Infinity;
  return points.filter((p) => {
    const t = new Date(p.at).getTime();
    return t >= lower && t <= upper;
  });
}
