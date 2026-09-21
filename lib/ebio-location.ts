type EbioDeviceConfig = { locationCode?: unknown };

// eBio UpdateEmployee requires DeviceName, not the human-readable worksite.
export function ebioLocationCode(config: unknown): string | null {
  const value = (config as EbioDeviceConfig | null)?.locationCode;
  if (typeof value !== "string") return null;
  const code = value.trim();
  return code && code.length <= 100 && !code.includes(",") ? code : null;
}

export function topologySyncInstruction(role: string): string {
  return role === "admin"
    ? "Run Admin > Settings > eBioserver > Sync topology, then retry."
    : "A tenant Admin must run Admin > Settings > eBioserver > Sync topology before device access can be provisioned.";
}
