export function idCardDownloadUrl(deviceCode: string, photoX: number, photoY: number, validTill: string) {
  const params = new URLSearchParams({ deviceCode: deviceCode.trim(), format: "pdf", photoX: String(photoX), photoY: String(photoY) });
  if (validTill) params.set("validTill", validTill);
  return `/api/id-cards?${params.toString()}`;
}

export function validTillFromRequest(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}
