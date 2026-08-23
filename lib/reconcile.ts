import { prisma } from "./prisma";
import { istStartOfDay, IST_OFFSET_MS } from "./ist";
import { computePunchStatusIST } from "./attendance";
import { minutesOfDay } from "./dates";
import type { Attendance, Employee, Punch, Shift, Tenant } from "@/generated/prisma/client";

export const FINALIZE_GRACE_HOURS = 2;
export const EARLY_WINDOW_MINUTES = 60;
export const MAX_SPAN_HOURS = 14;
export const HALF_DAY_HOURS = 4;

export type PunchMode = "first_last" | "alternating" | "strict";

export interface PunchEntry {
  id: string;
  time: string;
  source: string;
  type: "in" | "out" | "auto";
  deviceSn?: string | null;
}

export interface ReconcileResult {
  attendanceId: string | null;
  action: "created" | "updated" | "unchanged" | "cleared";
  inAt: Date | null;
  outAt: Date | null;
  status: string;
  lateMinutes: number;
  reviewStatus: string | null;
  punches: PunchEntry[];
}

/** Deterministic interpretation of a day's immutable punches. */
export function pairPunches(
  punches: Pick<Punch, "id" | "punchTime" | "source" | "inOutHint" | "deviceId">[],
  mode: PunchMode,
  deviceSerialByPunch: Map<string, string | null>
): PunchEntry[] {
  const sorted = [...punches].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
  const entries: PunchEntry[] = [];

  if (mode === "strict") {
    for (const p of sorted) {
      const hint = p.inOutHint;
      entries.push({
        id: p.id,
        time: p.punchTime.toISOString(),
        source: p.source,
        type: hint === "in" ? "in" : hint === "out" ? "out" : "auto",
        deviceSn: deviceSerialByPunch.get(p.id) ?? null,
      });
    }
    // Many eSSL deployments report an undefined punch state even in strict
    // mode. Honour explicit hints, but deterministically fill missing ends so
    // an otherwise valid day never becomes an attendance row with no IN time.
    if (entries.length > 0 && !entries.some((e) => e.type === "in")) {
      const firstAuto = entries.find((e) => e.type === "auto");
      if (firstAuto) firstAuto.type = "in";
    }
    if (entries.length > 1 && !entries.some((e) => e.type === "out")) {
      const lastAuto = [...entries].reverse().find((e) => e.type === "auto");
      if (lastAuto) lastAuto.type = "out";
    }
    return entries;
  }

  if (mode === "alternating") {
    sorted.forEach((p, i) => {
      entries.push({
        id: p.id,
        time: p.punchTime.toISOString(),
        source: p.source,
        type: i % 2 === 0 ? "in" : "out",
        deviceSn: deviceSerialByPunch.get(p.id) ?? null,
      });
    });
    return entries;
  }

  sorted.forEach((p, i) => {
    const isFirst = i === 0;
    const isLast = i === sorted.length - 1;
    entries.push({
      id: p.id,
      time: p.punchTime.toISOString(),
      source: p.source,
      type: isFirst ? "in" : isLast ? "out" : "auto",
      deviceSn: deviceSerialByPunch.get(p.id) ?? null,
    });
  });
  return entries;
}

function spanHours(inAt: Date | null, outAt: Date | null): number | null {
  if (!inAt || !outAt) return null;
  return (outAt.getTime() - inAt.getTime()) / 3600000;
}

/** Effective shift for an employee on a specific IST calendar day. */
export async function effectiveShiftForDay(
  employee: Pick<Employee, "id" | "shiftId" | "tenantId">,
  istDay: Date
): Promise<Shift | null> {
  const date = istStartOfDay(istDay);
  const roster = await prisma.rosterAssignment.findUnique({
    where: {
      tenantId_employeeId_date: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        date,
      },
    },
    include: { shift: true },
  });
  if (roster?.shift) return roster.shift;
  if (!employee.shiftId) return null;
  return prisma.shift.findFirst({ where: { id: employee.shiftId, tenantId: employee.tenantId } });
}

export function shiftWindow(
  istDay: Date,
  shift: Pick<Shift, "isNightShift" | "startTime"> | null
): { start: Date; end: Date } {
  const dayStart = istStartOfDay(istDay);
  const offsetMs =
    shift?.isNightShift && shift.startTime
      ? (minutesOfDay(shift.startTime) - EARLY_WINDOW_MINUTES) * 60000
      : 0;
  const start = new Date(dayStart.getTime() + offsetMs);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

export function punchDayForShift(
  instant: Date,
  shift: Pick<Shift, "isNightShift" | "startTime"> | null
): Date {
  const day = istStartOfDay(instant);
  if (!shift?.isNightShift || !shift.startTime) return day;
  const ist = new Date(instant.getTime() + IST_OFFSET_MS);
  const punchMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (punchMinutes < minutesOfDay(shift.startTime) - EARLY_WINDOW_MINUTES) {
    return new Date(day.getTime() - 24 * 3600 * 1000);
  }
  return day;
}

/** Reconcile one employee's IST calendar day from immutable punches. */
export async function reconcileEmployeeDay(
  tenant: Pick<Tenant, "id" | "config">,
  employee: Pick<Employee, "id" | "shiftId" | "tenantId" | "branchId">,
  istDay: Date,
  opts: { finalize?: boolean; mode?: PunchMode } = {}
): Promise<ReconcileResult> {
  const attendanceDate = istStartOfDay(istDay);
  const shift = await effectiveShiftForDay(employee, attendanceDate);
  const { start: windowStart, end: windowEnd } = shiftWindow(attendanceDate, shift);

  const punches = await prisma.punch.findMany({
    where: {
      tenantId: tenant.id,
      employeeId: employee.id,
      punchTime: { gte: windowStart, lt: windowEnd },
    },
    orderBy: { punchTime: "asc" },
  });

  const devices = await prisma.device.findMany({
    where: {
      tenantId: tenant.id,
      id: { in: punches.map((p) => p.deviceId).filter(Boolean) as string[] },
    },
    select: { id: true, serialNumber: true },
  });
  const serialByDevice = new Map(devices.map((d) => [d.id, d.serialNumber]));
  const serialByPunch = new Map(
    punches.map((p) => [p.id, p.deviceId ? serialByDevice.get(p.deviceId) ?? null : null])
  );

  const config = (tenant.config ?? {}) as { punches?: { mode?: PunchMode } };
  const mode = opts.mode ?? config.punches?.mode ?? "first_last";
  const entries = pairPunches(punches, mode, serialByPunch);
  const inEntry = entries.find((e) => e.type === "in");
  const outEntry = [...entries].reverse().find((e) => e.type === "out");
  const inAt = inEntry ? new Date(inEntry.time) : null;
  const outAt = outEntry ? new Date(outEntry.time) : null;

  const punchesCfg = (tenant.config ?? {}) as {
    punches?: { mode?: PunchMode; autoOut?: { enabled?: boolean; minutesAfterStart?: number } };
  };
  const autoOut = punchesCfg.punches?.autoOut;
  if (opts.finalize && !outAt && punches.length > 0 && autoOut?.enabled) {
    const hasAuto = punches.some((p) => p.source === "auto");
    if (!hasAuto) {
      const startMinutes = shift?.startTime ? minutesOfDay(shift.startTime) : 9 * 60;
      let outMinutes = startMinutes + (Number(autoOut.minutesAfterStart) || 540);
      if (outMinutes >= 1440) outMinutes -= 1440;
      const outAtDate = new Date(attendanceDate.getTime() + outMinutes * 60000);
      if (shift?.isNightShift && outMinutes < startMinutes) {
        outAtDate.setTime(outAtDate.getTime() + 24 * 3600 * 1000);
      }
      if (outAtDate.getTime() <= Date.now()) {
        await prisma.punch.create({
          data: {
            tenantId: tenant.id,
            employeeId: employee.id,
            source: "auto",
            punchTime: outAtDate,
            inOutHint: "out",
          },
        });
        return reconcileEmployeeDay(tenant, employee, attendanceDate, opts);
      }
    }
  }

  const span = spanHours(inAt, outAt);
  const finalize = opts.finalize ?? false;
  let status = "present";
  let lateMinutes = 0;
  let reviewStatus: string | null = null;

  if (inAt) {
    const r = computePunchStatusIST(
      shift as Pick<Shift, "startTime" | "graceMinutes"> | null,
      inAt
    );
    status = r.status;
    lateMinutes = r.lateMinutes;
  }

  if (punches.length > 0) {
    if (finalize && !outAt) {
      reviewStatus = "missed_punch";
    } else if (outAt && span !== null && span > MAX_SPAN_HOURS) {
      reviewStatus = "needs_review";
    } else if (finalize && outAt && span !== null && span < HALF_DAY_HOURS) {
      status = "half_day";
    }
  }

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: attendanceDate } },
  });

  if (existing?.finalized && !finalize) {
    return {
      attendanceId: existing.id,
      action: "unchanged",
      inAt: existing.punchInTime,
      outAt: existing.punchOutTime,
      status: existing.status,
      lateMinutes: existing.lateMinutes,
      reviewStatus: existing.reviewStatus,
      punches: entries,
    };
  }

  const punchJson = entries.map((e) => ({
    id: e.id,
    time: e.time,
    source: e.source,
    type: e.type,
    ...(e.deviceSn ? { deviceSn: e.deviceSn } : {}),
  }));

  if (punches.length === 0) {
    if (existing) {
      await prisma.attendance.delete({ where: { id: existing.id } });
      return {
        attendanceId: null,
        action: "cleared",
        inAt: null,
        outAt: null,
        status: "absent",
        lateMinutes: 0,
        reviewStatus: null,
        punches: [],
      };
    }
    return {
      attendanceId: null,
      action: "unchanged",
      inAt: null,
      outAt: null,
      status: "absent",
      lateMinutes: 0,
      reviewStatus: null,
      punches: [],
    };
  }

  let overtimeMinutes = 0;
  if (inAt && outAt && shift) {
    const scheduled =
      minutesOfDay(shift.endTime) - minutesOfDay(shift.startTime) +
      (shift.isNightShift ? 24 * 60 : 0);
    const worked = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000));
    overtimeMinutes = Math.max(0, worked - scheduled);
  }

  const data = {
    tenantId: tenant.id,
    branchId: employee.branchId ?? null,
    shiftId: shift?.id ?? null,
    punchInTime: inAt,
    punchOutTime: outAt,
    status,
    lateMinutes,
    overtimeMinutes,
    punches: punchJson,
    finalized: finalize,
    reviewStatus,
    note: finalize ? null : "pending finalization",
  };

  let attendance: Attendance;
  if (existing) {
    attendance = await prisma.attendance.update({ where: { id: existing.id }, data });
  } else {
    attendance = await prisma.attendance.create({
      data: {
        ...data,
        employeeId: employee.id,
        date: attendanceDate,
      },
    });
  }

  return {
    attendanceId: attendance.id,
    action: existing ? "updated" : "created",
    inAt,
    outAt,
    status,
    lateMinutes,
    reviewStatus,
    punches: entries,
  };
}

export function isFinalizable(
  istDay: Date,
  now = new Date(),
  shift?: Pick<Shift, "isNightShift" | "startTime"> | null
): boolean {
  const { end } = shiftWindow(istDay, shift ?? null);
  return now.getTime() > end.getTime() + FINALIZE_GRACE_HOURS * 3600 * 1000;
}

export async function finalizeEligibleDays(tenantId: string, limit = 200): Promise<number> {
  const open = await prisma.attendance.findMany({
    where: { tenantId, finalized: false },
    select: { id: true, employeeId: true, date: true },
    orderBy: { date: "asc" },
    take: limit,
  });
  if (open.length === 0) return 0;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return 0;

  let count = 0;
  for (const row of open) {
    const employee = await prisma.employee.findFirst({
      where: { id: row.employeeId, tenantId },
      select: { id: true, shiftId: true, tenantId: true, branchId: true },
    });
    if (!employee) continue;
    const shift = await effectiveShiftForDay(employee, row.date);
    if (!isFinalizable(row.date, undefined, shift)) continue;
    await reconcileEmployeeDay(tenant, employee, row.date, { finalize: true });
    count++;
  }
  return count;
}

export function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
