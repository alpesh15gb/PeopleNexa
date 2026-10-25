import { prisma } from "./prisma";
import { createPunchForEvent } from "./punch-idempotency";
import { attendanceDayForPunch, reconcileEmployeeDay } from "./reconcile";
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

function prismaErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

function isReconciliationRace(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code === "P2002" || code === "P2034";
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
      if (!isReconciliationRace(error) || attempt === 1) throw error;
    }
  }
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
      if (prismaErrorCode(error) !== "P2002") throw error;
      const duplicate = await prisma.deviceLog.findFirst({
        where: { deviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
      });
      if (!duplicate) throw error;
      if (duplicate.processed && !duplicate.error) return { accepted: true, action: "duplicate", logId: duplicate.id };
      log = duplicate;
    }
  }

  // 2. Match the immutable device enrollment code first. Employee Code is a
  // legacy fallback only for records not yet assigned a Device Code.
  const employee = await prisma.employee.findFirst({
    where: { tenantId: device.tenantId, status: "active", OR: [{ deviceCode: punch.userId }, { deviceCode: null, employeeNumber: punch.userId }] },
    select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
  });

  if (!employee) {
    await prisma.deviceLog.update({
      where: { id: log.id },
       data: { error: `No active employee with device code "${punch.userId}" in this workspace`, processed: true },
    });
    return { accepted: true, action: "no_employee", logId: log.id };
  }

  // 3. Append exactly once for this immutable raw-device event. Unlike a time
  // window this preserves distinct IN/OUT events seconds apart.
  const hint = String(punch.inOutMode ?? "0").trim() === "5" ? "in" : String(punch.inOutMode ?? "0").trim() === "1" ? "out" : "unknown";
  const created = await createPunchForEvent({
      tenantId: device.tenantId,
      employeeId: employee.id,
      deviceId: device.id,
      source: "device",
      eventKey: `device-log:${log.id}`,
      punchTime: punch.punchTime,
      inOutHint: hint,
  });

  // 4. Re-derive the day.
  const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
  const result = await reconcileWithRetry(
    tenant ?? { id: device.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: device.tenantId, branchId: employee.branchId },
    await attendanceDayForPunch(employee, punch.punchTime)
  );

  await markProcessed(log.id);
  return { accepted: true, action: result.action === "created" ? "in" : "out", logId: log.id, attendanceId: result.attendanceId };
}

function markProcessed(logId: string, error?: string) {
  return prisma.deviceLog.update({
    where: { id: logId },
    data: error ? { error, processed: true } : { error: null, processed: true },
  });
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
  limit = 2000,
  options: { includeHistorical?: boolean } = {}
): Promise<{ accepted: number; duplicate: number; failed: number }> {
  // Filter to exactly mapped active codes so old unmapped employees cannot
  // starve the recovery queue. Older retained evidence requires an explicit
  // historical recovery request, rather than silently changing past months.
  const employees = await prisma.employee.findMany({ where: { tenantId, status: "active", loginOnly: false }, select: { deviceCode: true, employeeNumber: true } });
  const mappedCodes = employees.map(employee => employee.deviceCode ?? employee.employeeNumber);
  if (!mappedCodes.length) return { accepted: 0, duplicate: 0, failed: 0 };
  const logs = await prisma.deviceLog.findMany({
    where: {
      tenantId,
      userId: { in: mappedCodes },
      ...(!options.includeHistorical ? { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } : {}),
      OR: [{ processed: false }, { error: { not: null } }],
    },
    select: { id: true, deviceId: true, userId: true, punchTime: true, rawData: true },
    // Always heal the newest device activity first. Without an explicit order,
    // PostgreSQL may fill this bounded queue with arbitrary old failures and
    // leave today's newly mapped punches unreconciled.
    orderBy: { punchTime: "desc" },
    take: limit,
  });

  const counters = { accepted: 0, duplicate: 0, failed: 0 };
  for (const log of logs) {
    try {
      if (!log.userId || !log.punchTime) {
        counters.failed++;
        continue;
      }
      const employee = await prisma.employee.findFirst({
        where: { tenantId, status: "active", OR: [{ deviceCode: log.userId }, { deviceCode: null, employeeNumber: log.userId }] },
        select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
      });
      if (!employee) {
        counters.failed++;
        continue; // still unmapped — stays flagged
      }

      const created = await createPunchForEvent({
          tenantId,
          employeeId: employee.id,
          deviceId: log.deviceId,
          source: "device",
          eventKey: `device-log:${log.id}`,
          punchTime: log.punchTime,
          inOutHint: "unknown",
      });

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      await reconcileWithRetry(
        tenant ?? { id: tenantId, config: null },
        { id: employee.id, shiftId: employee.shiftId, tenantId, branchId: employee.branchId },
        await attendanceDayForPunch(employee, log.punchTime)
      );
      await markProcessed(log.id);
      if (created.created) counters.accepted++; else counters.duplicate++;
    } catch {
      counters.failed++;
    }
  }
  return counters;
}
