export type IdCardEmployeeContent = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  joiningDate: Date | string | null;
  idCardIssuedAt?: Date | string | null;
  idCardValidUntil?: Date | string | null;
  phone: string | null;
  profile: { bloodGroup: string | null } | null;
};

export const ID_CARD_ARTBOARD = { width: 591, height: 1004 } as const;
export const ID_CARD_LAYOUT = {
  header: { x: 0, y: 0, width: 1, height: 0.22 },
  photo: { x: 0.28, y: 0.23, width: 0.37, height: 0.295 },
  fields: { x: 0.06, y: 0.535, width: 0.88, height: 0.276, rowHeight: 0.041, gap: 0.006 },
  footer: { x: 0, y: 0.85, width: 1, height: 0.15 },
  // This bounded area is owned by dynamic photo and employee content, not template artwork.
  frontContentPanel: { x: 0, y: 0.22, width: 1, height: 0.63 },
} as const;

const ellipsis = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

export function idCardDetails(employee: IdCardEmployeeContent) {
  const joiningDate = employee.joiningDate
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(employee.joiningDate))
    : "-";
  const format = (value: Date | string | null | undefined) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "-";
  return [
    ["Emp. ID", ellipsis(employee.employeeNumber, 24)],
    ["Emp. Name", ellipsis(`${employee.firstName} ${employee.lastName}`.trim(), 28)],
    ["Designation", ellipsis(employee.position ?? "-", 28)],
    ["DOJ", joiningDate],
    ["Issue Date", format(employee.idCardIssuedAt)],
    ["Validity", format(employee.idCardValidUntil)],
    ["Blood Group", ellipsis(employee.profile?.bloodGroup ?? "-", 16)],
    ["Contact", ellipsis(employee.phone ?? "-", 20)],
  ] as const;
}

export function idCardFieldsHeight() {
  const fieldCount = idCardDetails({ employeeNumber: "", firstName: "", lastName: "", position: null, joiningDate: null, phone: null, profile: null }).length;
  return fieldCount * ID_CARD_LAYOUT.fields.rowHeight + (fieldCount - 1) * ID_CARD_LAYOUT.fields.gap;
}

export function photoPosition(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50;
}
