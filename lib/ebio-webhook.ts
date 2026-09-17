import { handleDevicePunch } from "./iclock";
import { parseIST } from "./ist";
import { prisma } from "./prisma";

type EbioWebhookRecord = {
  EmployeeCode?: unknown;
  LogDate?: unknown;
  SerialNumber?: unknown;
  Direction?: unknown;
  DeviceDirection?: unknown;
};

function attendanceRecord(record: EbioWebhookRecord) {
  const employeeCode = String(record.EmployeeCode ?? "").trim();
  const serialNumber = String(record.SerialNumber ?? "").trim();
  const logDate = String(record.LogDate ?? "").trim();
  const punchTime = parseIST(logDate);
  if (!employeeCode || !serialNumber || !punchTime || punchTime.getUTCFullYear() < 2000) return null;
  if (/^(OPLOG\b|(?:FACE|FP|USER)\s+PIN=)/i.test(employeeCode)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(employeeCode)) return null;
  return { employeeCode, serialNumber, punchTime };
}

function liveCutover(): Date | null {
  const value = process.env.EBIO_WEBHOOK_LIVE_FROM?.trim();
  if (!value) return null;
  const parsed = parseIST(value);
  if (!parsed) throw new Error("EBIO_WEBHOOK_LIVE_FROM must be an IST timestamp such as 2026-09-17 09:00:00.");
  return parsed;
}

export async function processEbioWebhookDelivery(deliveryId: string) {
  const delivery = await prisma.ebioWebhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (delivery.processedAt) return { skipped: true, punches: 0, duplicates: 0, unmatchedEmployees: 0, quarantined: 0 };
  const cutoff = liveCutover();

  let payload: unknown;
  try {
    payload = JSON.parse(delivery.rawBody);
  } catch {
    await prisma.ebioWebhookDelivery.update({
      where: { id: delivery.id },
      data: { processedAt: new Date(), processingError: "Webhook body is not valid JSON." },
    });
    return { skipped: true, punches: 0, duplicates: 0, unmatchedEmployees: 0, quarantined: 1 };
  }

  const stats = { skipped: false, punches: 0, duplicates: 0, unmatchedEmployees: 0, quarantined: 0 };
  const devices = new Map<string, Awaited<ReturnType<typeof prisma.device.findUnique>>>();
  for (const record of Array.isArray(payload) ? payload : [payload]) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      stats.quarantined++;
      continue;
    }
    const event = attendanceRecord(record as EbioWebhookRecord);
    if (!event || !cutoff || event.punchTime < cutoff) {
      stats.quarantined++;
      continue;
    }
    let device = devices.get(event.serialNumber);
    if (device === undefined) {
      device = await prisma.device.findUnique({ where: { serialNumber: event.serialNumber } });
      devices.set(event.serialNumber, device);
    }
    if (!device) {
      stats.quarantined++;
      continue;
    }
    const direction = String((record as EbioWebhookRecord).Direction ?? (record as EbioWebhookRecord).DeviceDirection ?? "").trim().toUpperCase();
    const result = await handleDevicePunch(device, {
      userId: event.employeeCode,
      punchTime: event.punchTime,
      inOutMode: direction === "IN" ? "5" : direction === "OUT" ? "1" : "0",
      rawLine: JSON.stringify(record),
    });
    if (result.action === "duplicate") stats.duplicates++;
    else if (result.action === "no_employee") stats.unmatchedEmployees++;
    else stats.punches++;
  }

  await prisma.ebioWebhookDelivery.update({
    where: { id: delivery.id },
    data: {
      processedAt: new Date(),
      processingError: stats.quarantined ? `${stats.quarantined} record(s) quarantined: live cutover, invalid payload, unknown serial, or unsupported employee code.` : null,
    },
  });
  return stats;
}
