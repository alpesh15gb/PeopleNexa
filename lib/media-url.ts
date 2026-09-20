export type StoredMedia = { tenantId: string; locationId: string | null; filename: string };

const mediaPath = /^\/api\/media\/([^/]+)\/(tenant|locations\/[^/]+)\/([a-f0-9-]+\.(?:png|jpe?g))$/i;

export function parseMediaUrl(value: string | null | undefined): StoredMedia | null {
  const match = value?.match(mediaPath);
  return match ? { tenantId: match[1], locationId: match[2] === "tenant" ? null : match[2].slice("locations/".length), filename: match[3] } : null;
}
