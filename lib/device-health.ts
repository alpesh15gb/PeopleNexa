export const DEVICE_STALE_MS = 24 * 60 * 60 * 1000;
export const DEVICE_IDLE_MS = 2 * 60 * 60 * 1000;
export const REALTIME_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type DeviceHealthState = "disabled" | "pending" | "offline" | "stale" | "idle" | "online";

export function isRecentDeviceHeartbeat(lastSeenAt: Date, now = Date.now()): boolean {
  const seenAt = lastSeenAt.getTime();
  return seenAt <= now && now - seenAt < DEVICE_STALE_MS;
}

export function deviceHealthState(status: string, lastSeenAt: Date | null, now = Date.now()): DeviceHealthState {
  // Only connection states are derived from a heartbeat. This keeps any
  // future administrative status (for example maintenance) authoritative.
  if (status !== "active" && status !== "offline") return "disabled";
  if (!lastSeenAt) return status === "offline" ? "offline" : "pending";

  const seen = now - lastSeenAt.getTime();
  if (seen > DEVICE_STALE_MS) return "stale";
  if (seen > DEVICE_IDLE_MS) return "idle";
  return "online";
}

/** Realtime devices report their own availability from a short-lived poll/webhook. */
export function realtimeDeviceHealthState(status: string, lastSeenAt: Date | null, now = Date.now()): DeviceHealthState {
  if (status !== "active") return "disabled";
  if (!lastSeenAt) return "pending";
  const seen = now - lastSeenAt.getTime();
  return seen >= 0 && seen < REALTIME_ONLINE_WINDOW_MS ? "online" : "offline";
}

/** A missing/unparsed SOAP result must never reactivate a device. */
export function ebioHeartbeatPatch(lastSeenAt: Date | null, now = Date.now()): { lastSeenAt: Date; status?: "active" } | null {
  if (!lastSeenAt) return null;
  return { lastSeenAt, ...(isRecentDeviceHeartbeat(lastSeenAt, now) ? { status: "active" as const } : {}) };
}
