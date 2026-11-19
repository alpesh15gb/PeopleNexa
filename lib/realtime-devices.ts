import crypto from "node:crypto";
import { prisma } from "./prisma";
import { isUniqueWriteConflict, PENDING_DEVICE_ATTENDANCE, reconcileDeviceEvent } from "./device-attendance-ingest";
import type { RealtimeDevice } from "@/generated/prisma/client";
import { REALTIME_ONLINE_WINDOW_MS } from "./device-health";

// ── Realtime ingest (own track) ─────────────────────────────────────────────
// Same pipeline shape as lib/iclock.ts handleDevicePunch, but writing to the
// separate RealtimeLog table + Punch.realtimeDeviceId. Attendance rows are
// derived by the shared reconciler, so all three sources (ESSL / eBioserver /
// Realtime) show up uniformly. Nothing here touches Device / DeviceLog.

export { REALTIME_ONLINE_WINDOW_MS } from "./device-health";

export const REALTIME_PROTOCOLS = ["wss", "fkweb"] as const;

export const REALTIME_CAPABILITIES = ["FP", "PASSWORD", "IDCARD", "FACE", "QR"];

export function mintRealtimeApiKey(): string {
  return `rt_${crypto.randomBytes(24).toString("hex")}`;
}

export interface RealtimePunch {
  userId: string;
  punchTime: Date;
  verifyMode?: string;
  inOutMode?: string;
  rawLine: string;
}

export function realtimeStatusOf(
  device: Pick<RealtimeDevice, "serialNumber" | "protocol" | "status" | "lastSeenAt" | "ipAddress">
) {
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt) : null;
  const secondsAgo = lastSeen ? Math.max(0, Math.round((Date.now() - lastSeen.getTime()) / 1000)) : null;
  const online =
    device.status === "active" && lastSeen !== null && Date.now() - lastSeen.getTime() < REALTIME_ONLINE_WINDOW_MS;
  return {
    success: true,
    device_id: device.serialNumber,
    protocol: (device.protocol ?? "wss").toUpperCase(),
    online,
    status: device.status === "inactive" ? "INACTIVE" : online ? "ONLINE" : "OFFLINE",
    last_seen_local: lastSeen,
    seconds_ago: secondsAgo,
    ip_address: device.ipAddress,
  };
}

export function realtimeCapabilitiesOf(device: Pick<RealtimeDevice, "capabilities" | "config">): string[] {
  if (Array.isArray(device.capabilities) && device.capabilities.length > 0) {
    return (device.capabilities as unknown[]).map(String);
  }
  const cfg = (device.config ?? {}) as { supported_enroll_data?: unknown };
  if (Array.isArray(cfg.supported_enroll_data)) return cfg.supported_enroll_data.map(String);
  return [];
}

export async function handleRealtimePunch(device: RealtimeDevice, punch: RealtimePunch) {
  const existing = await prisma.realtimeLog.findFirst({
    where: { realtimeDeviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
  });
  if (existing?.processed && !existing.error) return { accepted: true as const, action: "duplicate" as const, logId: existing.id };

  let log = existing;
  let resume = Boolean(existing);
  if (!log) {
    try {
      log = await prisma.realtimeLog.create({
        data: {
          tenantId: device.tenantId,
          realtimeDeviceId: device.id,
          rawData: punch.rawLine,
          userId: punch.userId,
          punchTime: punch.punchTime,
          processed: false,
        },
      });
    } catch (error) {
      if (!isUniqueWriteConflict(error)) throw error;
      const duplicate = await prisma.realtimeLog.findFirst({
        where: { realtimeDeviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
      });
      if (!duplicate) throw error;
      if (duplicate.processed && !duplicate.error) return { accepted: true as const, action: "duplicate" as const, logId: duplicate.id };
      log = duplicate;
      resume = true;
    }
  }

  const event = { id: log.id, userId: punch.userId, punchTime: punch.punchTime };
  try {
    const processed = await reconcileDeviceEvent(device, event, "realtime", resume, punch.inOutMode);
    if (!processed) {
      await prisma.realtimeLog.update({
        where: { id: log.id },
        data: { processed: true, error: `No active employee with device code "${punch.userId}" in this workspace` },
      });
      return { accepted: true as const, action: "no_employee" as const, logId: log.id };
    }
    await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
    return {
      accepted: true as const,
      action: processed.created ? (processed.result.action === "created" ? "in" as const : "out" as const) : "duplicate" as const,
      logId: log.id,
      attendanceId: processed.result.attendanceId,
    };
  } catch (error) {
    await prisma.realtimeLog.updateMany({
      where: { id: log.id, OR: [{ processed: false }, { error: { not: null } }] },
      data: { processed: false, error: PENDING_DEVICE_ATTENDANCE },
    }).catch(() => undefined);
    throw error;
  }
}

/** Re-attempt realtime logs flagged with no-employee (mirrors reprocessFailedLogs). */
export async function reprocessFailedRealtimeLogs(
  tenantId: string,
  limit = 2000
): Promise<{ accepted: number; duplicate: number; failed: number }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const logs = await prisma.realtimeLog.findMany({
    where: {
      tenantId,
      createdAt: { gte: weekAgo },
      OR: [{ processed: false }, { error: { not: null } }],
    },
    select: { id: true, realtimeDeviceId: true, userId: true, punchTime: true },
    orderBy: { punchTime: "desc" },
    take: limit,
  });
  const counters = { accepted: 0, duplicate: 0, failed: 0 };
  for (const log of logs) {
    if (!log.userId || !log.punchTime) {
      counters.failed++;
      continue;
    }
    try {
      const processed = await reconcileDeviceEvent(
        { id: log.realtimeDeviceId, tenantId },
        { id: log.id, userId: log.userId, punchTime: log.punchTime },
        "realtime", true,
      );
      if (!processed) {
        counters.failed++;
        continue;
      }
      await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
      counters[processed.created ? "accepted" : "duplicate"]++;
    } catch {
      counters.failed++;
    }
  }
  return counters;
}
