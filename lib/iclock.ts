import { prisma } from "./prisma";
import { isUniqueWriteConflict, PENDING_DEVICE_ATTENDANCE, reconcileDeviceEvent } from "./device-attendance-ingest";
import type { Device, Employee } from "@/generated/prisma/client";

export interface RawPunch {
  userId: string;
  punchTime: Date;
  verifyMode?: string;
  inOutMode?: string;
  rawLine: string;
}

export interface PunchResult {
  accepted: boolean; // record counted in the OK: n ACK (ingested or duplicate)
  action: string;
  logId?: string;
  attendanceId?: string | null;
}

/**
 * Ingest one device punch.
 *
 * Phase 4 flow: the raw DeviceLog is kept as an immutable audit record, a
 * normalized Punch is appended to the employee's day, and the reconciliation
 * engine (lib/reconcile.ts) re-derives the Attendance row from all punches.
 * in/out times are never attached greedily here.
 */
export async function handleDevicePunch(
  device: Device,
  punch: RawPunch
): Promise<PunchResult> {
  // 1. Idempotent raw log (device + user + time). Re-uploads are no-ops.
  const existing = await prisma.deviceLog.findFirst({
    where: { deviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
  });
  if (existing?.processed && !existing.error) {
    return { accepted: true, action: "duplicate", logId: existing.id };
  }

  let log = existing;
  let resume = Boolean(existing);
  if (!log) {
    try {
      log = await prisma.deviceLog.create({
        data: {
          tenantId: device.tenantId,
          deviceId: device.id,
          rawData: punch.rawLine,
          userId: punch.userId,
          punchTime: punch.punchTime,
          processed: false,
        },
      });
    } catch (error) {
      if (!isUniqueWriteConflict(error)) throw error;
      const duplicate = await prisma.deviceLog.findFirst({
        where: { deviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
      });
      if (!duplicate) throw error;
      if (duplicate.processed && !duplicate.error) return { accepted: true, action: "duplicate", logId: duplicate.id };
      log = duplicate;
      resume = true;
    }
  }

  const event = { id: log.id, userId: punch.userId, punchTime: punch.punchTime };
  try {
    const processed = await reconcileDeviceEvent(device, event, "device", resume, punch.inOutMode);
    if (!processed) {
      await prisma.deviceLog.update({
        where: { id: log.id },
        data: { processed: true, error: `No active employee with device code "${punch.userId}" in this workspace` },
      });
      return { accepted: true as const, action: "no_employee" as const, logId: log.id };
    }
    await prisma.deviceLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
    return {
      accepted: true as const,
      action: processed.created ? (processed.result.action === "created" ? "in" as const : "out" as const) : "duplicate" as const,
      logId: log.id,
      attendanceId: processed.result.attendanceId,
    };
  } catch (error) {
    await prisma.deviceLog.updateMany({
      where: { id: log.id, OR: [{ processed: false }, { error: { not: null } }] },
      data: { processed: false, error: PENDING_DEVICE_ATTENDANCE },
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * Re-attempt logs that were flagged because no employee matched at ingest time
 * (e.g. before an employee import). Idempotent — a log that still has no
 * employee stays flagged; one that now matches produces a Punch and clears.
 *
 * Retry selection covers both unprocessed rows AND errored rows, bounded to
 * the last 7 days so the queue cannot grow without bound. Clean duplicates
 * are marked processed:true error:null (no error pollution). Returns honest
 * counters instead of a single inflated number.
 */
export async function reprocessFailedLogs(
  tenantId: string,
  limit = 2000
): Promise<{ accepted: number; duplicate: number; failed: number }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const logs = await prisma.deviceLog.findMany({
    where: {
      tenantId,
      createdAt: { gte: weekAgo },
      OR: [{ processed: false }, { error: { not: null } }],
    },
    select: { id: true, deviceId: true, userId: true, punchTime: true },
    // Always heal the newest device activity first. Without an explicit order,
    // PostgreSQL may fill this bounded queue with arbitrary old failures and
    // leave today's newly mapped punches unreconciled.
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
        { id: log.deviceId, tenantId },
        { id: log.id, userId: log.userId, punchTime: log.punchTime },
        "device", true,
      );
      if (!processed) {
        counters.failed++;
        continue;
      }
      await prisma.deviceLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
      counters[processed.created ? "accepted" : "duplicate"]++;
    } catch {
      counters.failed++;
    }
  }
  return counters;
}
