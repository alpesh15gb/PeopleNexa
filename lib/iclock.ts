import { prisma } from "./prisma";
import { reconcileEmployeeDay, punchDayForShift } from "./reconcile";
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
export async function handleDevicePunch(device: Device, punch: RawPunch): Promise<PunchResult> {
  // 1. Idempotent raw log (device + user + time). Re-uploads are no-ops.
  const existing = await prisma.deviceLog.findFirst({
    where: { deviceId: device.id, userId: punch.userId, punchTime: punch.punchTime },
  });
  if (existing) {
    return { accepted: true, action: "duplicate", logId: existing.id };
  }

  const log = await prisma.deviceLog.create({
    data: {
      tenantId: device.tenantId,
      deviceId: device.id,
      rawData: punch.rawLine,
      userId: punch.userId,
      punchTime: punch.punchTime,
      processed: false,
    },
  });

  // 2. Map the device user code to an employee in this tenant.
  const employee = await prisma.employee.findFirst({
    where: { tenantId: device.tenantId, employeeNumber: punch.userId },
    select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
  });

  if (!employee) {
    await prisma.deviceLog.update({
      where: { id: log.id },
      data: { error: `No employee with code "${punch.userId}" in this workspace`, processed: true },
    });
    return { accepted: true, action: "no_employee", logId: log.id };
  }

  // 3. Append the normalized punch (dedupe ±60s, same as reconciliation).
  const near = await prisma.punch.findFirst({
    where: {
      employeeId: employee.id,
      punchTime: { gte: new Date(punch.punchTime.getTime() - 60000), lte: new Date(punch.punchTime.getTime() + 60000) },
    },
  });
  if (near) {
    await markProcessed(log.id, "duplicate punch within 60s");
    return { accepted: true, action: "duplicate", logId: log.id };
  }

  const hint = String(punch.inOutMode ?? "0").trim() === "5" ? "in" : String(punch.inOutMode ?? "0").trim() === "1" ? "out" : "unknown";
  const created = await prisma.punch.create({
    data: {
      tenantId: device.tenantId,
      employeeId: employee.id,
      deviceId: device.id,
      source: "device",
      punchTime: punch.punchTime,
      inOutHint: hint,
    },
  });

  // 4. Re-derive the day.
  const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
  const result = await reconcileEmployeeDay(
    tenant ?? { id: device.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: device.tenantId, branchId: employee.branchId },
    punchDayForShift(punch.punchTime, employee.shift),
    { finalize: false }
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
 */
export async function reprocessFailedLogs(tenantId: string, limit = 2000): Promise<number> {
  const logs = await prisma.deviceLog.findMany({
    where: { tenantId, processed: true, error: { not: null } },
    select: { id: true, deviceId: true, userId: true, punchTime: true, rawData: true },
    take: limit,
  });

  let reprocessed = 0;
  for (const log of logs) {
    if (!log.userId || !log.punchTime) continue;
    const employee = await prisma.employee.findFirst({
      where: { tenantId, employeeNumber: log.userId },
      select: { id: true, shiftId: true, branchId: true, tenantId: true, shift: true },
    });
    if (!employee) continue; // still unmapped — stays flagged

    const near = await prisma.punch.findFirst({
      where: {
        employeeId: employee.id,
        punchTime: { gte: new Date(log.punchTime.getTime() - 60000), lte: new Date(log.punchTime.getTime() + 60000) },
      },
    });
    if (near) {
      await markProcessed(log.id); // punch exists — just clear the flag
      continue;
    }

    await prisma.punch.create({
      data: {
        tenantId,
        employeeId: employee.id,
        deviceId: log.deviceId,
        source: "device",
        punchTime: log.punchTime,
        inOutHint: "unknown",
      },
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await reconcileEmployeeDay(
      tenant ?? { id: tenantId, config: null },
      { id: employee.id, shiftId: employee.shiftId, tenantId, branchId: employee.branchId },
      punchDayForShift(log.punchTime, employee.shift),
      { finalize: false }
    );
    await markProcessed(log.id);
    reprocessed++;
  }
  return reprocessed;
}
