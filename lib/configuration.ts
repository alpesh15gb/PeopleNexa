export const CONFIGURATION_KINDS = ["dashboard", "id_card", "leave_policy", "payroll_policy"] as const;
export type ConfigurationKind = (typeof CONFIGURATION_KINDS)[number];

export type IdCardTemplate = { frontBackgroundUrl: string; backBackgroundUrl: string };

export type WorkedDayAccrual = { source: "attendance_status"; tiers: Array<{ minDays: number; maxDays: number; daysEarned: number }>; joiningMonthClaimDeferral: "none" | "next_month" };
export type LeavePolicyDraft = { leaveTypes: Array<{ name: string; code: string; annualEntitlement: number; paid: boolean; allowsHalfDay: boolean; requiresApproval: boolean; carryForward: boolean; carryForwardLimit: number | null; workedDayAccrual?: WorkedDayAccrual }> };
export type PayrollComponentRule = { code: string; label: string; kind: "earning" | "deduction"; formula: "fixed" | "percent_of_ctc" | "percent_of_component" | "salary_band_fixed"; amount: number; basisComponentCode?: string; bands?: Array<{ minCtc: number; maxCtc: number | null; amount: number }>; minCtc: number | null; maxCtc: number | null; includeInGross: boolean; visibleOnPayslip: boolean; pfWageBase: boolean };
export type PayrollPolicyDraft = { monthlyDivisor: number; deductLossOfPay: boolean; overtimeMultiplier: number; overtimeBasis: "basic_hourly" | "fixed_hourly"; statutory: { pfEnabled: boolean; pfWageCeiling: number; esicEnabled: boolean; esicGrossCeiling: number; professionalTaxEnabled: boolean; professionalTaxState: string; labourWelfareFundEnabled: boolean; tdsEnabled: boolean; tdsRegime: "new" | "old" }; components?: PayrollComponentRule[] };

export const DASHBOARD_WIDGETS = [
  "total_employees", "present", "late", "permission", "absent", "pending_leaves", "pending_leave_requests",
  "attendance_trend", "device_attendance", "project_attendance", "todays_attendance",
  "driving_license_expiry", "birthdays", "anniversaries", "new_joiners", "departments", "gender_ratio",
] as const;
export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number];
export type DashboardWidgetSize = "compact" | "standard" | "wide";
export type DashboardLayout = { widgets: Array<{ key: DashboardWidgetKey; enabled: boolean; order: number; size: DashboardWidgetSize }> };

export function dashboardLayout(payload: unknown): DashboardLayout | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const widgets = (payload as Record<string, unknown>).widgets;
  if (!Array.isArray(widgets) || widgets.length === 0 || widgets.length > DASHBOARD_WIDGETS.length) return null;
  const seen = new Set<string>();
  const orders = new Set<number>();
  const parsed: DashboardLayout["widgets"] = [];
  for (const widget of widgets) {
    if (!widget || typeof widget !== "object" || Array.isArray(widget)) return null;
    const value = widget as Record<string, unknown>;
    const key = value.key;
    const enabled = value.enabled;
    const order = value.order;
    const size = value.size;
    if (typeof key !== "string" || !DASHBOARD_WIDGETS.includes(key as DashboardWidgetKey) || seen.has(key) || typeof enabled !== "boolean" || typeof order !== "number" || !Number.isInteger(order) || order < 0 || order >= DASHBOARD_WIDGETS.length || orders.has(order) || !["compact", "standard", "wide"].includes(String(size))) return null;
    seen.add(key);
    orders.add(order);
    parsed.push({ key: key as DashboardWidgetKey, enabled, order, size: size as DashboardWidgetSize });
  }
  return { widgets: parsed.sort((a, b) => a.order - b.order) };
}

export function idCardTemplate(payload: unknown): IdCardTemplate | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const frontBackgroundUrl = typeof record.frontBackgroundUrl === "string" ? record.frontBackgroundUrl : "";
  const backBackgroundUrl = typeof record.backBackgroundUrl === "string" ? record.backBackgroundUrl : "";
  // Lazy import avoidance keeps this shared resolver usable in client code.
  if (!isSafeImageUrl(frontBackgroundUrl) || !isSafeImageUrl(backBackgroundUrl)) return null;
  return { frontBackgroundUrl, backBackgroundUrl };
}

export function leavePolicyDraft(payload: unknown): LeavePolicyDraft | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const leaveTypes = (payload as Record<string, unknown>).leaveTypes;
  if (!Array.isArray(leaveTypes) || leaveTypes.length === 0 || leaveTypes.length > 30) return null;
  const codes = new Set<string>();
  const parsed: LeavePolicyDraft["leaveTypes"] = [];
  for (const item of leaveTypes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const value = item as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const code = typeof value.code === "string" ? value.code.trim().toUpperCase() : "";
    const annualEntitlement = value.annualEntitlement;
    const carryForwardLimit = value.carryForwardLimit;
    const workedDayAccrual = parseWorkedDayAccrual(value.workedDayAccrual);
    if (!name || name.length > 80 || !/^[A-Z0-9_-]{1,20}$/.test(code) || codes.has(code) || typeof annualEntitlement !== "number" || !Number.isInteger(annualEntitlement) || annualEntitlement < 0 || annualEntitlement > 366 || typeof value.paid !== "boolean" || typeof value.allowsHalfDay !== "boolean" || typeof value.requiresApproval !== "boolean" || typeof value.carryForward !== "boolean" || (value.carryForward ? (typeof carryForwardLimit !== "number" || !Number.isInteger(carryForwardLimit) || carryForwardLimit < 0 || carryForwardLimit > 366) : carryForwardLimit !== null) || (value.workedDayAccrual !== undefined && !workedDayAccrual)) return null;
    codes.add(code);
    parsed.push({ name, code, annualEntitlement, paid: value.paid, allowsHalfDay: value.allowsHalfDay, requiresApproval: value.requiresApproval, carryForward: value.carryForward, carryForwardLimit: carryForwardLimit as number | null, ...(workedDayAccrual ? { workedDayAccrual } : {}) });
  }
  return { leaveTypes: parsed };
}

function parseWorkedDayAccrual(input: unknown): WorkedDayAccrual | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.source !== "attendance_status" || !["none", "next_month"].includes(String(value.joiningMonthClaimDeferral)) || !Array.isArray(value.tiers) || value.tiers.length === 0 || value.tiers.length > 31) return null;
  const tiers: WorkedDayAccrual["tiers"] = [];
  for (const tier of value.tiers) {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return null;
    const row = tier as Record<string, unknown>;
    if (![row.minDays, row.maxDays, row.daysEarned].every(Number.isInteger) || (row.minDays as number) < 0 || (row.maxDays as number) > 31 || (row.minDays as number) > (row.maxDays as number) || (row.daysEarned as number) < 0 || (row.daysEarned as number) > 31) return null;
    tiers.push({ minDays: row.minDays as number, maxDays: row.maxDays as number, daysEarned: row.daysEarned as number });
  }
  tiers.sort((a, b) => a.minDays - b.minDays);
  if (tiers.some((tier, index) => index > 0 && tiers[index - 1].maxDays >= tier.minDays)) return null;
  return { source: "attendance_status", tiers, joiningMonthClaimDeferral: value.joiningMonthClaimDeferral as WorkedDayAccrual["joiningMonthClaimDeferral"] };
}

export function payrollPolicyDraft(payload: unknown): PayrollPolicyDraft | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>; const statutory = value.statutory;
  if (!statutory || typeof statutory !== "object" || Array.isArray(statutory)) return null;
  const rules = statutory as Record<string, unknown>;
  const whole = (input: unknown, min: number, max: number) => typeof input === "number" && Number.isInteger(input) && input >= min && input <= max;
  const decimal = (input: unknown, min: number, max: number) => typeof input === "number" && Number.isFinite(input) && input >= min && input <= max;
  const state = typeof rules.professionalTaxState === "string" ? rules.professionalTaxState.trim() : "";
  if (!whole(value.monthlyDivisor, 1, 366) || typeof value.deductLossOfPay !== "boolean" || !decimal(value.overtimeMultiplier, 0, 10) || !["basic_hourly", "fixed_hourly"].includes(String(value.overtimeBasis)) || typeof rules.pfEnabled !== "boolean" || !whole(rules.pfWageCeiling, 0, 10_000_000) || typeof rules.esicEnabled !== "boolean" || !whole(rules.esicGrossCeiling, 0, 10_000_000) || typeof rules.professionalTaxEnabled !== "boolean" || state.length > 80 || typeof rules.labourWelfareFundEnabled !== "boolean" || typeof rules.tdsEnabled !== "boolean" || !["new", "old"].includes(String(rules.tdsRegime))) return null;
  const components = parsePayrollComponents(value.components, decimal);
  if (value.components !== undefined && !components) return null;
  return { monthlyDivisor: value.monthlyDivisor as number, deductLossOfPay: value.deductLossOfPay, overtimeMultiplier: value.overtimeMultiplier as number, overtimeBasis: value.overtimeBasis as PayrollPolicyDraft["overtimeBasis"], statutory: { pfEnabled: rules.pfEnabled, pfWageCeiling: rules.pfWageCeiling as number, esicEnabled: rules.esicEnabled, esicGrossCeiling: rules.esicGrossCeiling as number, professionalTaxEnabled: rules.professionalTaxEnabled, professionalTaxState: state, labourWelfareFundEnabled: rules.labourWelfareFundEnabled, tdsEnabled: rules.tdsEnabled, tdsRegime: rules.tdsRegime as "new" | "old" }, ...(components ? { components } : {}) };
}

function parsePayrollComponents(input: unknown, decimal: (input: unknown, min: number, max: number) => boolean): PayrollComponentRule[] | null {
  if (!Array.isArray(input) || input.length > 30) return null;
  const codes = new Set<string>(); let pfBases = 0;
  const parsed: PayrollComponentRule[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const value = item as Record<string, unknown>; const code = typeof value.code === "string" ? value.code.trim().toUpperCase() : ""; const label = typeof value.label === "string" ? value.label.trim() : ""; const minCtc = value.minCtc ?? null; const maxCtc = value.maxCtc ?? null; const basisComponentCode = typeof value.basisComponentCode === "string" ? value.basisComponentCode.trim().toUpperCase() : undefined;
    if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(code) || codes.has(code) || !label || label.length > 80 || !["earning", "deduction"].includes(String(value.kind)) || !["fixed", "percent_of_ctc", "percent_of_component", "salary_band_fixed"].includes(String(value.formula)) || !decimal(value.amount, 0, 10_000_000) || (minCtc !== null && !decimal(minCtc, 0, 10_000_000)) || (maxCtc !== null && !decimal(maxCtc, 0, 10_000_000)) || (minCtc !== null && maxCtc !== null && minCtc > maxCtc) || typeof value.includeInGross !== "boolean" || typeof value.visibleOnPayslip !== "boolean" || typeof value.pfWageBase !== "boolean" || (value.formula === "percent_of_component" && !basisComponentCode) || (value.formula !== "percent_of_component" && basisComponentCode) || (value.formula === "salary_band_fixed" && !Array.isArray(value.bands)) || (value.formula !== "salary_band_fixed" && value.bands !== undefined) || (value.pfWageBase && value.kind !== "earning")) return null;
    const bands = value.formula === "salary_band_fixed" ? (value.bands as unknown[]).map((band) => { if (!band || typeof band !== "object" || Array.isArray(band)) return null; const row = band as Record<string, unknown>; const max = row.maxCtc ?? null; return decimal(row.minCtc, 0, 10_000_000) && (max === null || decimal(max, 0, 10_000_000)) && (max === null || (row.minCtc as number) <= (max as number)) && decimal(row.amount, 0, 10_000_000) ? { minCtc: row.minCtc as number, maxCtc: max as number | null, amount: row.amount as number } : null; }) : undefined;
    if (bands?.some((band) => band === null) || (bands && (bands.length === 0 || [...bands].sort((a, b) => a!.minCtc - b!.minCtc).some((band, index, sorted) => index > 0 && sorted[index - 1]!.maxCtc !== null && sorted[index - 1]!.maxCtc! >= band!.minCtc))) || (basisComponentCode && !codes.has(basisComponentCode))) return null;
    if (value.pfWageBase) pfBases++; codes.add(code);
    parsed.push({ code, label, kind: value.kind as "earning" | "deduction", formula: value.formula as PayrollComponentRule["formula"], amount: value.amount as number, ...(basisComponentCode ? { basisComponentCode } : {}), ...(bands ? { bands: bands as PayrollComponentRule["bands"] } : {}), minCtc: minCtc as number | null, maxCtc: maxCtc as number | null, includeInGross: value.includeInGross as boolean, visibleOnPayslip: value.visibleOnPayslip as boolean, pfWageBase: value.pfWageBase as boolean });
  }
  return pfBases > 1 ? null : parsed;
}

function isSafeImageUrl(value: string) {
  const source = value.trim();
  if (/^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(source)) return source.slice(source.indexOf(",") + 1).replace(/\s/g, "").length <= 6_666_668;
  if (source.length > 2_048) return false;
  try { const url = new URL(source); return url.protocol === "https:" && !url.username && !url.password && !url.port && !isPrivateHost(url.hostname); } catch { return false; }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every(Number.isInteger) && (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
}

/**
 * Resolves the future configuration hierarchy without touching current live
 * behaviour. Consumers must opt in explicitly before using this result.
 */
export function resolveConfiguration<T extends { locationId: string | null; active: boolean; effectiveFrom: Date; effectiveTo: Date | null }>(
  records: T[],
  locationId: string | null,
  at = new Date()
): T | null {
  return [...records]
    .filter((record) => record.active && record.effectiveFrom <= at && (!record.effectiveTo || record.effectiveTo >= at))
    .filter((record) => record.locationId === locationId || record.locationId === null)
    .sort((a, b) => Number(b.locationId === locationId) - Number(a.locationId === locationId) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}
