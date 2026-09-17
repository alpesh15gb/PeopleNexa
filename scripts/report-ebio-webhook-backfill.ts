import "dotenv/config";
import { prisma } from "../lib/prisma";
import { parseIST } from "../lib/ist";

type EbioRecord = {
  EmployeeCode?: unknown;
  LogDate?: unknown;
  SerialNumber?: unknown;
};

function dateBoundary(value: string, endOfDay: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("EBIO_REPORT_FROM and EBIO_REPORT_TO must use YYYY-MM-DD.");
  }
  const parsed = parseIST(`${value} ${endOfDay ? "23:59:59" : "00:00:00"}`);
  if (!parsed) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

function attendanceRecord(record: EbioRecord): { employeeCode: string; serialNumber: string; punchTime: Date } | null {
  const employeeCode = String(record.EmployeeCode ?? "").trim();
  const serialNumber = String(record.SerialNumber ?? "").trim();
  const logDate = String(record.LogDate ?? "").trim();
  const punchTime = parseIST(logDate);
  if (!employeeCode || !serialNumber || !punchTime) return null;
  if (/^(OPLOG\b|(?:FACE|FP|USER)\s+PIN=)/i.test(employeeCode)) return null;
  if (punchTime.getUTCFullYear() < 2000) return null;
  return { employeeCode, serialNumber, punchTime };
}

async function main() {
  const slug = process.env.EBIO_TENANT_SLUG?.trim() || "ksipl";
  const fromKey = process.env.EBIO_REPORT_FROM?.trim();
  const toKey = process.env.EBIO_REPORT_TO?.trim();
  if (!fromKey || !toKey) {
    throw new Error("Set EBIO_REPORT_FROM and EBIO_REPORT_TO before running this report.");
  }
  const from = dateBoundary(fromKey, false);
  const to = dateBoundary(toKey, true);
  if (from > to) throw new Error("EBIO_REPORT_FROM must not be after EBIO_REPORT_TO.");

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug }, select: { id: true, slug: true } });
  const deliveries = await prisma.ebioWebhookDelivery.findMany({ select: { rawBody: true } });
  const events = new Map<string, { employeeCode: string; serialNumber: string; punchTime: Date }>();
  let ignored = 0;

  for (const delivery of deliveries) {
    let payload: unknown;
    try {
      payload = JSON.parse(delivery.rawBody);
    } catch {
      ignored++;
      continue;
    }
    for (const record of Array.isArray(payload) ? payload : [payload]) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        ignored++;
        continue;
      }
      const event = attendanceRecord(record as EbioRecord);
      if (!event || event.punchTime < from || event.punchTime > to) {
        ignored++;
        continue;
      }
      events.set(`${event.serialNumber}\u0000${event.employeeCode}\u0000${event.punchTime.getTime()}`, event);
    }
  }

  const [devices, employees] = await Promise.all([
    prisma.device.findMany({ where: { tenantId: tenant.id }, select: { id: true, serialNumber: true } }),
    prisma.employee.findMany({ where: { tenantId: tenant.id }, select: { id: true, employeeNumber: true, deviceCode: true } }),
  ]);
  const deviceBySerial = new Map(devices.map((device) => [device.serialNumber, device]));
  const employeeByCode = new Map<string, { id: string }>();
  for (const employee of employees) {
    employeeByCode.set(employee.employeeNumber, employee);
    if (employee.deviceCode) employeeByCode.set(employee.deviceCode, employee);
  }

  const unresolvedSerials = new Set<string>();
  const unresolvedCodes = new Set<string>();
  const expectedDeviceByPunch = new Map<string, string | null>();
  let mappedEvents = 0;
  for (const event of events.values()) {
    const device = deviceBySerial.get(event.serialNumber);
    const employee = employeeByCode.get(event.employeeCode);
    if (!device) unresolvedSerials.add(event.serialNumber);
    if (!employee) unresolvedCodes.add(event.employeeCode);
    if (!device || !employee) continue;
    mappedEvents++;
    const key = `${employee.id}\u0000${event.punchTime.getTime()}`;
    const existing = expectedDeviceByPunch.get(key);
    // Never propose a correction if two webhook events claim different
    // machines for the same employee and exact instant.
    expectedDeviceByPunch.set(key, existing === undefined || existing === device.id ? device.id : null);
  }

  const punches = await prisma.punch.findMany({
    where: { tenantId: tenant.id, punchTime: { gte: from, lte: to } },
    select: { id: true, employeeId: true, deviceId: true, punchTime: true, source: true },
  });
  const matchedPunches = punches.filter((punch) => expectedDeviceByPunch.has(`${punch.employeeId}\u0000${punch.punchTime.getTime()}`));
  const devicePunchMatches = matchedPunches.filter((punch) => punch.source === "device" || punch.source === "ebioserver");
  const ambiguousPunchMatches = devicePunchMatches.filter((punch) => expectedDeviceByPunch.get(`${punch.employeeId}\u0000${punch.punchTime.getTime()}`) === null).length;
  const alreadyAttributed = devicePunchMatches.filter((punch) => expectedDeviceByPunch.get(`${punch.employeeId}\u0000${punch.punchTime.getTime()}`) === punch.deviceId).length;

  console.log(JSON.stringify({
    tenant: tenant.slug,
    range: { from: fromKey, to: toKey },
    deliveries: deliveries.length,
    uniqueAttendanceEvents: events.size,
    ignoredRecords: ignored,
    mappedEvents,
    exactPunchMatches: matchedPunches.length,
    nonDevicePunchMatches: matchedPunches.length - devicePunchMatches.length,
    exactDevicePunchMatches: devicePunchMatches.length,
    ambiguousPunchMatches,
    eligibleMachineCorrections: devicePunchMatches.length - alreadyAttributed - ambiguousPunchMatches,
    unresolvedSerials: [...unresolvedSerials].sort(),
    unresolvedEmployeeCodes: [...unresolvedCodes].sort(),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
