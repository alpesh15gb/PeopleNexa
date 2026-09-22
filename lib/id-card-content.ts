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

export type IdCardGenerationDetails = {
  issuedAt?: Date;
  validTill?: string | null;
};

const MM_TO_POINTS = 72 / 25.4;

// CR80 is 85.60 x 53.98 mm. Portrait cards use the short side as their width.
export const ID_CARD_ARTBOARD = { width: 53.98, height: 85.6 } as const;
export const ID_CARD_SIZE = {
  widthMm: ID_CARD_ARTBOARD.width,
  heightMm: ID_CARD_ARTBOARD.height,
  widthPt: ID_CARD_ARTBOARD.width * MM_TO_POINTS,
  heightPt: ID_CARD_ARTBOARD.height * MM_TO_POINTS,
} as const;

export const ID_CARD_LAYOUT = {
  background: { fit: "cover", position: "center" },
  header: { x: 0, y: 0, width: 1, height: 0.22 },
  photo: { x: 0.28, y: 0.23, width: 0.37, height: 0.295, borderWidth: 1, radius: 4 },
  fields: {
    x: 0.06, y: 0.535, width: 0.88, height: 0.307,
    labelWidth: 0.34, rowHeight: 0.034, gap: 0.005,
    fontSize: 5.5, lineHeight: 1.1, overflow: "ellipsis",
  },
  footer: { x: 0, y: 0.85, width: 1, height: 0.15 },
  branding: {
    logo: { x: 0.06, y: 0.03, width: 0.22, height: 0.14 },
    companyName: { x: 0.32, y: 0.084, width: 0.62, height: 0.035, fontSize: 8, lineHeight: 1.1 },
    contact: { x: 0.05, y: 0.895, width: 0.9, height: 0.07, fontSize: 5.5, lineHeight: 1.2, maxLines: 2 },
  },
  // This bounded area is owned by dynamic photo and employee content, not template artwork.
  frontContentPanel: { x: 0, y: 0.22, width: 1, height: 0.63 },
} as const;

export const ID_CARD_FONT = {
  family: "Inter",
  regular: "Inter-Regular",
  semibold: "Inter-SemiBold",
} as const;

export function idCardFieldsHeight() {
  const fieldCount = idCardDetails({ employeeNumber: "", firstName: "", lastName: "", position: null, joiningDate: null, phone: null, profile: null }).length;
  return fieldCount * ID_CARD_LAYOUT.fields.rowHeight + (fieldCount - 1) * ID_CARD_LAYOUT.fields.gap;
}

const ellipsis = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

export function formatIdCardDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  // Picker values are calendar dates, so preserve the selected day independently of server timezone.
  const dateOnly = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function idCardDetails(employee: IdCardEmployeeContent, generation: IdCardGenerationDetails = {}) {
  const issuedAt = generation.issuedAt ?? employee.idCardIssuedAt;
  const validTill = generation.validTill ?? employee.idCardValidUntil;
  return [
    ["Emp. ID", ellipsis(employee.employeeNumber, 24)],
    ["Emp. Name", ellipsis(`${employee.firstName} ${employee.lastName}`.trim(), 28)],
    ["Designation", ellipsis(employee.position ?? "-", 28)],
    ["DOJ", formatIdCardDate(employee.joiningDate)],
    ["Issued Date", formatIdCardDate(issuedAt)],
    ["Valid Till", formatIdCardDate(validTill)],
    ["Blood Group", ellipsis(employee.profile?.bloodGroup ?? "-", 16)],
    ["Contact", ellipsis(employee.phone ?? "-", 20)],
  ] as const;
}

export function photoPosition(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 50;
}
