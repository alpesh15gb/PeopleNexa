import crypto from "node:crypto";
import { prisma } from "./prisma";
import { reconcileEmployeeDay, punchDayForShift } from "./reconcile";
import type { RealtimeDevice } from "@/generated/prisma/client";

// ── Realtime ingest (own track) ─────────────────────────────────────────────
// Same pipeline shape as lib/iclock.ts handleDevicePunch, but writing to the
// separate RealtimeLog table + Punch.realtimeDeviceId. Attendance rows are
// derived by the shared reconciler, so all three sources (ESSL / eBioserver /
// Realtime) show up uniformly. Nothing here touches Device / DeviceLog.

export const REALTIME_ONLINE_WINDOW_MS = 5 * 60 * 1000;

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

function prismaErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

async function reconcileWithRetry(
  tenant: Parameters<typeof reconcileEmployeeDay>[0],
  employee: Parameters<typeof reconcileEmployeeDay>[1],
  istDay: Date
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await reconcileEmployeeDay(tenant, employee, istDay, { finalize: false });
    } catch (error) {
      const code = prismaErrorCode(error);
      if ((code !== "P2002" && code !== "P2034") || attempt === 1) throw error;
    }
  }
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
  if (existing) return { accepted: true as const, action: "duplicate" as const, logId: existing.id };

  let log;
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
    if (prismaErrorCode(error) !== "P2002") throw error;
    const duplicate = await prisma.realtimeLog.findFirst({
      where: { realtimeDeviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
    });
    if (duplicate) return { accepted: true as const, action: "duplicate" as const, logId: duplicate.id };
    throw error;
  }

  const employee = await prisma.employee.findFirst({
    where: { tenantId: device.tenantId, employeeNumber: punch.userId, status: "active" },
    select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
  });
  if (!employee) {
    await prisma.realtimeLog.update({
      where: { id: log.id },
      data: { error: `No active employee with code "${punch.userId}" in this workspace`, processed: true },
    });
    return { accepted: true as const, action: "no_employee" as const, logId: log.id };
  }

  const near = await prisma.punch.findFirst({
    where: {
      employeeId: employee.id,
      punchTime: { gte: new Date(punch.punchTime.getTime() - 60000), lte: new Date(punch.punchTime.getTime() + 60000) },
    },
  });
  if (near) {
    // Clean dedupe marker — expected device behaviour, not an error.
    await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
    return { accepted: true as const, action: "duplicate" as const, logId: log.id };
  }

  const hint =
    String(punch.inOutMode ?? "0").trim() === "5"
      ? "in"
      : String(punch.inOutMode ?? "0").trim() === "1"
        ? "out"
        : "unknown";
  const created = await prisma.punch.create({
    data: {
      tenantId: device.tenantId,
      employeeId: employee.id,
      realtimeDeviceId: device.id,
      source: "realtime",
      punchTime: punch.punchTime,
      inOutHint: hint,
    },
  });
  void created;

  const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
  const result = await reconcileWithRetry(
    tenant ?? { id: device.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: device.tenantId, branchId: employee.branchId },
    punchDayForShift(punch.punchTime, employee.shift)
  );

  await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
  return {
    accepted: true as const,
    action: result.action === "created" ? ("in" as const) : ("out" as const),
    logId: log.id,
    attendanceId: result.attendanceId,
  };
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
    take: limit,
  });
  const counters = { accepted: 0, duplicate: 0, failed: 0 };
  for (const log of logs) {
    try {
      if (!log.userId || !log.punchTime) {
        counters.failed++;
        continue;
      }
      const device = await prisma.realtimeDevice.findUnique({ where: { id: log.realtimeDeviceId } });
      if (!device) {
        counters.failed++;
        continue;
      }
      const employee = await prisma.employee.findFirst({
        where: { tenantId, employeeNumber: log.userId, status: "active" },
        select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
      });
      if (!employee) {
        counters.failed++;
        continue;
      }
      const near = await prisma.punch.findFirst({
        where: {
          employeeId: employee.id,
          punchTime: { gte: new Date(log.punchTime.getTime() - 60000), lte: new Date(log.punchTime.getTime() + 60000) },
        },
      });
      if (near) {
        await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
        counters.duplicate++;
        continue;
      }
      await prisma.punch.create({
        data: {
          tenantId,
          employeeId: employee.id,
          realtimeDeviceId: device.id,
          source: "realtime",
          punchTime: log.punchTime,
          inOutHint: "unknown",
        },
      });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      await reconcileWithRetry(
        tenant ?? { id: tenantId, config: null },
        { id: employee.id, shiftId: employee.shiftId, tenantId, branchId: employee.branchId },
        punchDayForShift(log.punchTime, employee.shift)
      );
      await prisma.realtimeLog.update({ where: { id: log.id }, data: { error: null, processed: true } });
      counters.accepted++;
    } catch {
      counters.failed++;
    }
  }
  return counters;
}
