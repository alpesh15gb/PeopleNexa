export type WorkspaceRegion = {
  countryCode: string;
  currency: string;
  locale: string;
  timeZone: string;
};

export const DEFAULT_WORKSPACE_REGION: WorkspaceRegion = {
  countryCode: "IN",
  currency: "INR",
  locale: "en-IN",
  timeZone: "Asia/Kolkata",
};

const countryNames = new Intl.DisplayNames("en", { type: "region", fallback: "none" });
const currencies = new Set(Intl.supportedValuesOf("currency"));

export function parseWorkspaceRegion(value: unknown): WorkspaceRegion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Partial<Record<keyof WorkspaceRegion, unknown>>;
  if (typeof input.countryCode !== "string" || typeof input.currency !== "string" || typeof input.locale !== "string" || typeof input.timeZone !== "string") return null;
  const countryCode = input.countryCode.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode) || countryCode === "ZZ" || !countryNames.of(countryCode) || !currencies.has(currency)) return null;
  const requestedTimeZone = input.timeZone.trim();
  if (requestedTimeZone.length > 100 || input.locale.length > 60 || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(requestedTimeZone)) return null;
  try {
    const [locale] = Intl.getCanonicalLocales(input.locale.trim());
    if (!locale || !Intl.NumberFormat.supportedLocalesOf([locale]).length) return null;
    const timeZone = new Intl.DateTimeFormat("en", { timeZone: requestedTimeZone }).resolvedOptions().timeZone;
    return { countryCode, currency, locale, timeZone: timeZone === "Asia/Calcutta" ? "Asia/Kolkata" : timeZone };
  } catch {
    return null;
  }
}

export function workspaceRegion(config: unknown): WorkspaceRegion {
  const value = (config as { workspaceRegion?: unknown } | null)?.workspaceRegion;
  return parseWorkspaceRegion(value) ?? DEFAULT_WORKSPACE_REGION;
}

export function supportsIndiaPayroll(region: Pick<WorkspaceRegion, "countryCode" | "currency">) {
  return region.countryCode === "IN" && region.currency === "INR";
}

export function formatRegionalMoney(amount: number, region: Pick<WorkspaceRegion, "currency" | "locale">) {
  return new Intl.NumberFormat(region.locale, { style: "currency", currency: region.currency }).format(amount);
}
