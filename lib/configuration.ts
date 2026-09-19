export const CONFIGURATION_KINDS = ["dashboard", "id_card", "leave_policy", "payroll_policy"] as const;
export type ConfigurationKind = (typeof CONFIGURATION_KINDS)[number];

/**
 * Resolves the future configuration hierarchy without touching current live
 * behaviour. Consumers must opt in explicitly before using this result.
 */
export function resolveConfiguration<T extends { locationId: string | null; active: boolean; effectiveFrom: Date; effectiveTo: Date | null }>(
  records: T[],
  locationId: string | null,
  at = new Date()
): T | null {
  return records
    .filter((record) => record.active && record.effectiveFrom <= at && (!record.effectiveTo || record.effectiveTo >= at))
    .filter((record) => record.locationId === locationId || record.locationId === null)
    .sort((a, b) => Number(b.locationId === locationId) - Number(a.locationId === locationId) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}
