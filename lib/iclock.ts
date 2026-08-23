import { prisma } from "./prisma";
import { reconcileEmployeeDay } from "./reconcile";
import { punchDayForEmployee } from "./punch-day";
import type { Device } from "@/generated/prisma/client";

export interface RawPunch {
  userId: string;
  punchTime: Date;
  verifyMode?: string;
  inOutMode?: string;
  rawLine: string;
}

export interface ParsedAttlogLine {
  userId: string;
  dateTime: string;
  verifyMode: string;
  inOutMode: string;
}

export interface PunchResult {
  accepted: boolean;
  action: string;
  logId?: string;
  attendanceId?: string | null;
  newPunch?: boolean;
}

/**
 * Parse eSSL/ZKTeco ATTLOG variants without shifting verify/in-out columns.
 * Canonical tab format is:
 *   PIN<TAB>YYYY-MM-DD HH:mm:ss<TAB>Verify<TAB>InOut<TAB>WorkCode
 * Some firmware sends whitespace-delimited data, splitting date and time.
 */
export function parseAttlogLine(line: string): ParsedAttlogLine | null {
  const tabs = line.split("\t").map((p) => p.trim());
  if (tabs.length >= 2) {
    const userId = tabs[0];
    const dateTime = tabs[1];
    if (!userId || !dateTime) return null;
    return {
      userId,
      dateTime,
      verifyMode: tabs[2] || "0",
      inOutMode: tabs[3] || "0",
    };
  }

  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const userId = parts[0];
  const hasSeparatedTime = /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{2}:\d{2}/.test(parts[2]);
  const dateTime = hasSeparatedTime ? `${parts[1]} ${parts[2]}` : parts[1];
  const offset = hasSeparatedTime ? 1 : 0;
  return {
    userId,
    dateTime,
    verifyMode: parts[2 + offset] || "0",
    inOutMode: parts[3 + offset] || "0",
  };
}

export async function handleDevicePunch(device: Device, punch: RawPunch): Promise<PunchResult> {
  const existing = await prisma.deviceLog.findFirst({
    where: {
      tenantId: device.tenantId,
      deviceId: device.id,
      userId: punch.userId,
      punchTime: punch.punchTime,
    },
  });
  if (existing) {
    return { accepted: true, action: "duplicate", logId: existing.id, newPunch: false };
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

  const employee = await prisma.employee.findFirst({
    where: { tenantId: device.tenantId, employeeNumber: punch.userId, status: "active" },
    select: { id: true, shiftId: true, branchId: true, tenantId: true },
  });

  if (!employee) {
    await prisma.deviceLog.update({
      where: { id: log.id },
      data: { error: `No active employee with code "${punch.userId}" in this workspace`, processed: true },
    });
    return { accepted: true, action: "no_employee", logId: log.id, newPunch: false };
  }

  const near = await prisma.punch.findFirst({
    where: {
      tenantId: device.tenantId,
      employeeId: employee.id,
      punchTime: {
        gte: new Date(punch.punchTime.getTime() - 60000),
        lte: new Date(punch.punchTime.getTime() + 60000),
      },
    },
  });
  if (near) {
    await markProcessed(log.id, "duplicate punch within 60s");
    return { accepted: true, action: "duplicate", logId: log.id, newPunch: false };
  }

  const mode = String(punch.inOutMode ?? "0").trim();
  const hint = mode === "5" || /^in$/i.test(mode) ? "in" : mode === "1" || /^out$/i.test(mode) ? "out" : "unknown";
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

  const tenant = await prisma.tenant.findUnique({ where: { id: device.tenantId } });
  const attendanceDay = await punchDayForEmployee(employee, punch.punchTime);
  const result = await reconcileEmployeeDay(
    tenant ?? { id: device.tenantId, config: null },
    employee,
    attendanceDay,
    { finalize: false }
  );

  await markProcessed(log.id);
  const interpreted = result.punches.find((p) => p.id === created.id)?.type;
  return {
    accepted: true,
    action: interpreted === "in" || interpreted === "out" ? interpreted : "punch",
    logId: log.id,
    attendanceId: result.attendanceId,
    newPunch: true,
  };
}

function markProcessed(logId: string, error?: string) {
  return prisma.deviceLog.update({
    where: { id: logId },
    data: error ? { error, processed: true } : { error: null, processed: true },
  });
}

export async function reprocessFailedLogs(tenantId: string, limit = 2000): Promise<number> {
  const logs = await prisma.deviceLog.findMany({
    where: { tenantId, processed: true, error: { not: null } },
    select: { id: true, deviceId: true, userId: true, punchTime: true, rawData: true },
    take: limit,
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return 0;

  let reprocessed = 0;
  for (const log of logs) {
    if (!log.userId || !log.punchTime) continue;
    const employee = await prisma.employee.findFirst({
      where: { tenantId, employeeNumber: log.userId, status: "active" },
      select: { id: true, shiftId: true, branchId: true, tenantId: true },
    });
    if (!employee) continue;

    const near = await prisma.punch.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        punchTime: {
          gte: new Date(log.punchTime.getTime() - 60000),
          lte: new Date(log.punchTime.getTime() + 60000),
        },
      },
    });
    if (near) {
      await markProcessed(log.id);
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

    const attendanceDay = await punchDayForEmployee(employee, log.punchTime);
    await reconcileEmployeeDay(tenant, employee, attendanceDay, { finalize: false });
    await markProcessed(log.id);
    reprocessed++;
  }
  return reprocessed;
}
