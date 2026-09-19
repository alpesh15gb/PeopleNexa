export const CONFIGURATION_KINDS = ["dashboard", "id_card", "leave_policy", "payroll_policy"] as const;
export type ConfigurationKind = (typeof CONFIGURATION_KINDS)[number];

export type IdCardTemplate = { frontBackgroundUrl: string; backBackgroundUrl: string };

export function idCardTemplate(payload: unknown): IdCardTemplate | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const frontBackgroundUrl = typeof record.frontBackgroundUrl === "string" ? record.frontBackgroundUrl : "";
  const backBackgroundUrl = typeof record.backBackgroundUrl === "string" ? record.backBackgroundUrl : "";
  // Lazy import avoidance keeps this shared resolver usable in client code.
  if (!isSafeImageUrl(frontBackgroundUrl) || !isSafeImageUrl(backBackgroundUrl)) return null;
  return { frontBackgroundUrl, backBackgroundUrl };
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
  return records
    .filter((record) => record.active && record.effectiveFrom <= at && (!record.effectiveTo || record.effectiveTo >= at))
    .filter((record) => record.locationId === locationId || record.locationId === null)
    .sort((a, b) => Number(b.locationId === locationId) - Number(a.locationId === locationId) || b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}
