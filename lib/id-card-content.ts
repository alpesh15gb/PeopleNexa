export type IdCardEmployeeContent = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  joiningDate: Date | string | null;
  phone: string | null;
  profile: { bloodGroup: string | null } | null;
};

export const ID_CARD_ARTBOARD = { width: 591, height: 1004 } as const;
export const ID_CARD_LAYOUT = {
  photo: { x: 0.28, y: 0.23, width: 0.37, height: 0.295 },
  fields: { x: 0.06, y: 0.535, width: 0.88, rowHeight: 0.041, gap: 0.006 },
} as const;

const ellipsis = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

export function idCardDetails(employee: IdCardEmployeeContent) {
  const joiningDate = employee.joiningDate
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(employee.joiningDate))
    : "-";
  return [
    ["Emp. ID", ellipsis(employee.employeeNumber, 24)],
    ["Emp. Name", ellipsis(`${employee.firstName} ${employee.lastName}`.trim(), 28)],
    ["Designation", ellipsis(employee.position ?? "-", 28)],
    ["DOJ", joiningDate],
    ["Blood Group", ellipsis(employee.profile?.bloodGroup ?? "-", 16)],
    ["Contact", ellipsis(employee.phone ?? "-", 20)],
  ] as const;
}

export function photoPosition(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50;
}
