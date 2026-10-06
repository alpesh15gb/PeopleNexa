import { prisma } from "./prisma";
import { automaticShiftForDay } from "./automatic-shift-resolution";
import type { AutomaticShiftPolicy } from "./automatic-shifts";
import { istStartOfDay } from "./ist";

/** Fill only missing shifts on today's unfinished records; preserve payroll data. */
export async function applyAutomaticShiftsToday(tenantId: string, branchId: string, policy: AutomaticShiftPolicy, now = new Date()) {
  if (!policy.enabled) return 0;
  const date = istStartOfDay(now);
  const [shifts, records] = await Promise.all([
    prisma.shift.findMany({ where: { tenantId, id: { in: policy.shiftIds } } }),
    prisma.attendance.findMany({
      where: { tenantId, date, finalized: false, shiftId: null, employee: { branchId } },
      select: { id: true, employee: { select: { id: true, tenantId: true, branchId: true } } },
    }),
  ]);
  let updated = 0;
  // Bound concurrent device-punch reads rather than overwhelming the DB pool.
  for (let offset = 0; offset < records.length; offset += 5) {
    const counts = await Promise.all(records.slice(offset, offset + 5).map(async (record) => {
      const roster = await prisma.rosterAssignment.findUnique({ where: { tenantId_employeeId_date: { tenantId, employeeId: record.employee.id, date } }, select: { shiftId: true } });
      const shiftId = roster?.shiftId ?? (await automaticShiftForDay(record.employee, date, { policy, shifts }))?.id;
      if (!shiftId) return 0;
      const result = await prisma.attendance.updateMany({
        where: { id: record.id, tenantId, finalized: false, shiftId: null, employee: { branchId } },
        data: { shiftId },
      });
      return result.count;
    }));
    updated += counts.reduce((sum, count) => sum + count, 0);
  }
  return updated;
}
