import { authorizedPunchDayFilter } from "./attendance-presence";

export const ATTENDANCE_REVIEW_FLAGS = ["missed_punch", "needs_review"];

export type AttendanceDrilldownStatus = "present" | "late" | "needs_review";

export function attendanceDrilldownStatus(value: string | undefined): AttendanceDrilldownStatus | null {
  return value === "present" || value === "late" || value === "needs_review" ? value : null;
}

export function attendanceEmployeeScope({
  tenantId,
  branchId,
  locationId,
}: {
  tenantId: string;
  branchId?: string | null;
  locationId?: string | null;
}) {
  return {
    tenantId,
    status: "active",
    loginOnly: false,
    ...(locationId ? { branch: { locationId } } : {}),
    ...(branchId ? { branchId } : {}),
  };
}

export function attendanceStatusFilter(status: AttendanceDrilldownStatus, start: Date, end: Date, punchWindow = { start, end }) {
  if (status === "present") {
    return {
      punches: { some: authorizedPunchDayFilter(punchWindow.start, punchWindow.end) },
    };
  }
  return {
    attendance: {
      some: { ...(status === "needs_review" ? { reviewStatus: { in: ATTENDANCE_REVIEW_FLAGS } } : { status }), date: { gte: start, lt: end } },
    },
  };
}
