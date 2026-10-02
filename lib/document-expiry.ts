export function expiryStatus(expiryDate: Date | null): "none" | "expired" | "expiring" | "ok" {
  if (!expiryDate) return "none";
  const days = Math.round((expiryDate.getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";
  return "ok";
}
