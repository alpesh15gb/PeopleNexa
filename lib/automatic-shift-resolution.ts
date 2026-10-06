import { prisma } from "./prisma";
import { automaticShiftPolicy, AUTOMATIC_SHIFT_KIND, automaticShiftWindow, detectAutomaticShift } from "./automatic-shifts";
import { istStartOfDay } from "./ist";

export async function automaticShiftsForEmployee(employee: { id: string; tenantId: string; branchId?: string | null }) {
  const branchId = employee.branchId === undefined ? (await prisma.employee.findFirst({ where: { id: employee.id, tenantId: employee.tenantId }, select: { branchId: true } }))?.branchId : employee.branchId;
  if (!branchId) return null;
  const config = await prisma.configurationRecord.findFirst({ where: { tenantId: employee.tenantId, kind: AUTOMATIC_SHIFT_KIND, scopeKey: `branch:${branchId}`, active: true } });
  const policy = automaticShiftPolicy(config?.payload);
  if (!policy?.enabled) return null;
  const shifts = await prisma.shift.findMany({ where: { tenantId: employee.tenantId, id: { in: policy.shiftIds } } });
  return { policy, shifts };
}

export async function automaticShiftForDay(employee: { id: string; tenantId: string; branchId?: string | null }, day: Date, settings: NonNullable<Awaited<ReturnType<typeof automaticShiftsForEmployee>>>) {
  const date = istStartOfDay(day);
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date } }, select: { shiftId: true } });
  const stored = settings.shifts.find((s) => s.id === existing?.shiftId);
  if (stored) return stored;
  if (!settings.shifts.length) return null;
  const windows = settings.shifts.map((s) => automaticShiftWindow(date, s, settings.policy));
  const previousDay = new Date(date.getTime() - 86400000);
  const prior = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: previousDay } }, select: { shiftId: true, punchInTime: true } });
  const priorShift = settings.shifts.find((s) => s.id === prior?.shiftId);
  const priorEnd = prior?.punchInTime && priorShift?.isNightShift ? automaticShiftWindow(previousDay, priorShift, settings.policy).end : null;
  const punches = await prisma.punch.findMany({ where: { tenantId: employee.tenantId, employeeId: employee.id, authStatus: { in: ["auto", "approved"] }, inOutHint: { not: "out" }, punchTime: { gte: new Date(Math.min(...windows.map((w) => w.start.getTime()))), lt: new Date(Math.max(...windows.map((w) => w.end.getTime()))) } }, orderBy: { punchTime: "asc" } });
  for (const punch of punches) {
    if (priorEnd && punch.punchTime < priorEnd && punch.inOutHint !== "in") continue;
    const shift = detectAutomaticShift(date, punch.punchTime, settings.shifts, settings.policy);
    if (shift) return shift;
  }
  return null;
}
