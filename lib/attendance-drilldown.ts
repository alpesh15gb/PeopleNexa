import { authorizedPunchDayFilter } from "./attendance-presence";

export type AttendanceDrilldownStatus = "present" | "late";

export function attendanceDrilldownStatus(value: string | undefined): AttendanceDrilldownStatus | null {
  return value === "present" || value === "late" ? value : null;
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

export function attendanceStatusFilter(status: AttendanceDrilldownStatus, start: Date, end: Date) {
  if (status === "present") {
    return {
      punches: { some: authorizedPunchDayFilter(start, end) },
    };
  }
  return {
    attendance: {
      some: { status, date: { gte: start, lt: end } },
    },
  };
}
