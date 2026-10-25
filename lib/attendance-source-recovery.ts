import { prisma } from "./prisma";
import { istDateKey } from "./ist";

/** Retained device evidence is not an authorized/assessed attendance day. It
 * does, however, prevent an unfinished source event being called an absence.
 * Matching uses exact enrollment codes, never numeric conversion or aliases.
 */
export async function unprocessedAttendanceSourceDays(
  tenantId: string,
  employees: Array<{ id: string; deviceCode: string | null; employeeNumber: string }>,
  start: Date,
  end: Date,
) {
  if (!employees.length) return new Set<string>();
  const byCode = new Map(employees.map(e => [e.deviceCode ?? e.employeeNumber, e.id]));
  const where = { tenantId, userId: { in: [...byCode.keys()] }, punchTime: { gte: start, lt: end }, OR: [{ processed: false }, { error: { not: null } }] };
  const [device, realtime] = await Promise.all([
    prisma.deviceLog.findMany({ where, select: { userId: true, punchTime: true } }),
    prisma.realtimeLog.findMany({ where, select: { userId: true, punchTime: true } }),
  ]);
  const days = new Set<string>();
  for (const log of [...device, ...realtime]) {
    const id = log.userId ? byCode.get(log.userId) : null;
    if (id && log.punchTime) days.add(`${id}|${istDateKey(log.punchTime)}`);
  }
  return days;
}
