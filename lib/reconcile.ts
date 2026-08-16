import { prisma } from "./prisma";
import { istStartOfDay, IST_OFFSET_MS } from "./ist";
import { computePunchStatusIST } from "./attendance";
import { minutesOfDay } from "./dates";
import type { Attendance, Employee, Punch, Shift, Tenant } from "@/generated/prisma/client";

// A day is finalizable once its IST window has closed plus a grace period,
// so late-arriving punches can't keep mutating a finalized day.
export const FINALIZE_GRACE_HOURS = 2;

// Night-shift windows open this many minutes before the shift's start time so
// early device/mobile punches (a few minutes before 22:00) still land in the
// shift's day instead of leaking into the previous day's window.
export const EARLY_WINDOW_MINUTES = 60;

// A single in→out span longer than this is implausible for a normal shift and
// flags the day for review (the mispunch guard).
export const MAX_SPAN_HOURS = 14;

// Total presence below this marks the day as a half day (only when finalized
// and at least one punch exists).
export const HALF_DAY_HOURS = 4;

export type PunchMode = "first_last" | "alternating" | "strict";

export interface PunchEntry {
  id: string;
  time: string; // ISO
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

/** Punch pairing modes — deterministic interpretation of a day's punches. */
export function pairPunches(
  punches: Pick<Punch, "id" | "punchTime" | "source" | "inOutHint" | "deviceId">[],
  mode: PunchMode,
  deviceSerialByPunch: Map<string, string | null>
): PunchEntry[] {
  const sorted = [...punches].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
  const entries: PunchEntry[] = [];

  if (mode === "strict") {
    // Trust the reported in/out; fall back to first/last for unknown hints.
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

  // first_last (default): first punch = in, last punch = out, intermediates kept
  // as audit. Matches the industry-standard "undefined mode" device setup.
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

/**
 * The IST punch window for one calendar day given the employee's shift. Night
 * shifts (e.g. 22:00 → 06:00) start the window at the shift's start time so
 * the early-morning out punch stays paired with the previous evening's in
 * punch instead of leaking into the next calendar day (where it would read as
 * a fresh "in" and invert every night-shift record).
 */
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

/**
 * The IST calendar day whose punch window contains `instant`, given the
 * employee's shift. For night shifts a morning punch (before the shift's start
 * time, e.g. the 06:00 out of a 22:00 → 06:00 shift) belongs to the previous
 * calendar day; day-shift punches always belong to their own calendar day.
 */
export function punchDayForShift(
  instant: Date,
  shift: Pick<Shift, "isNightShift" | "startTime"> | null
): Date {
  const day = istStartOfDay(instant);
  if (!shift?.isNightShift || !shift.startTime) return day;
  const ist = new Date(instant.getTime() + IST_OFFSET_MS);
  const punchMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  // Before the (pre-grace) window opens → this is a morning out for the
  // previous calendar day's night shift.
  if (punchMinutes < minutesOfDay(shift.startTime) - EARLY_WINDOW_MINUTES) {
    return new Date(day.getTime() - 24 * 3600 * 1000);
  }
  return day;
}

/**
 * Reconcile one employee's IST day from its punches and upsert the Attendance
 * row (the derived view). Punches are immutable; this is the only place that
 * writes in/out/status.
 */
export async function reconcileEmployeeDay(
  tenant: Pick<Tenant, "id" | "config">,
  employee: Pick<Employee, "id" | "shiftId" | "tenantId" | "branchId">,
  istDay: Date,
  opts: { finalize?: boolean; mode?: PunchMode } = {}
): Promise<ReconcileResult> {
  // The day's shift: a roster assignment for this date wins over the
  // employee's default shift (weekly rosters drive daily reconciliation).
  const roster = await prisma.rosterAssignment.findUnique({
    where: { tenantId_employeeId_date: { tenantId: employee.tenantId, employeeId: employee.id, date: istStartOfDay(istDay) } },
    include: { shift: true },
  });
  const shift = roster?.shift ?? (employee.shiftId ? await prisma.shift.findUnique({ where: { id: employee.shiftId } }) : null);
  const { start: dayStart, end: dayEnd } = shiftWindow(istDay, shift);

  const punches = await prisma.punch.findMany({
    where: { employeeId: employee.id, punchTime: { gte: dayStart, lt: dayEnd } },
    orderBy: { punchTime: "asc" },
  });

  const devices = await prisma.device.findMany({
    where: { id: { in: punches.map((p) => p.deviceId).filter(Boolean) as string[] } },
    select: { id: true, serialNumber: true },
  });
  const serialByDevice = new Map(devices.map((d) => [d.id, d.serialNumber]));
  const serialByPunch = new Map(punches.map((p) => [p.id, p.deviceId ? serialByDevice.get(p.deviceId) ?? null : null]));

  const config = (tenant.config ?? {}) as { punches?: { mode?: PunchMode } };
  const mode = opts.mode ?? config.punches?.mode ?? "first_last";

  const entries = pairPunches(punches, mode, serialByPunch);
  const inEntry = entries.find((e) => e.type === "in");
  const outEntry = [...entries].reverse().find((e) => e.type === "out");
  const inAt = inEntry ? new Date(inEntry.time) : null;
  const outAt = outEntry ? new Date(outEntry.time) : null;

  // Auto punch-out: when a day finalizes with an in punch but no out punch and
  // the tenant has enabled it, close the day at the configured time instead of
  // flagging a missed punch-out. Re-runs reconciliation so the auto punch is
  // treated like any other ledger entry (guard: never insert twice).
  const punchesCfg = (tenant.config ?? {}) as { punches?: { mode?: PunchMode; autoOut?: { enabled?: boolean; minutesAfterStart?: number } } };
  const autoOut = punchesCfg.punches?.autoOut;
  if (opts.finalize && !outAt && punches.length > 0 && autoOut?.enabled) {
    const hasAuto = punches.some((p) => p.source === "auto");
    if (!hasAuto) {
      const startMinutes = shift?.startTime ? minutesOfDay(shift.startTime) : 9 * 60;
      let outMinutes = startMinutes + (Number(autoOut.minutesAfterStart) || 540);
      if (outMinutes >= 1440) outMinutes -= 1440; // wraps past midnight
      const outAtDate = new Date(istStartOfDay(istDay).getTime() + outMinutes * 60000);
      if (shift?.isNightShift && outMinutes < startMinutes) {
        outAtDate.setTime(outAtDate.getTime() + 24 * 3600 * 1000); // next-day morning out
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
        return reconcileEmployeeDay(tenant, employee, istDay, opts);
      }
    }
  }

  const span = spanHours(inAt, outAt);
  const finalize = opts.finalize ?? false;

  // Status + flags.
  let status = "present";
  let lateMinutes = 0;
  let reviewStatus: string | null = null;

  if (inAt) {
    const r = computePunchStatusIST(shift as Pick<Shift, "startTime" | "graceMinutes"> | null, inAt);
    status = r.status;
    lateMinutes = r.lateMinutes;
  }

  if (punches.length > 0) {
    if (finalize && !outAt) {
      // Window closed with a lone punch → probable missed punch-out.
      reviewStatus = "missed_punch";
    } else if (outAt && span !== null && span > MAX_SPAN_HOURS) {
      // Implausible span (e.g. next-day punch glued on) → needs a human.
      reviewStatus = "needs_review";
    } else if (finalize && outAt && span !== null && span < HALF_DAY_HOURS) {
      status = "half_day";
    }
  }

  const existing = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: { gte: dayStart, lt: dayEnd } },
  });

  // A live punch (mobile/device ingest with finalize:false) landing on an
  // already-locked day must not re-open it: the punch stays as immutable
  // audit, but the derived day keeps its finalized in/out/status. Admin
  // corrections pass finalize:true and are the only path that can touch a
  // finalized day.
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
      return { attendanceId: null, action: "cleared", inAt: null, outAt: null, status: "absent", lateMinutes: 0, reviewStatus: null, punches: [] };
    }
    return { attendanceId: null, action: "unchanged", inAt: null, outAt: null, status: "absent", lateMinutes: 0, reviewStatus: null, punches: [] };
  }

  const data = {
    tenantId: tenant.id,
    branchId: employee.branchId ?? null,
    shiftId: employee.shiftId ?? null,
    punchInTime: inAt,
    punchOutTime: outAt,
    status,
    lateMinutes,
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
        date: dayStart,
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

/**
 * True when the IST day's punch window has closed and is safe to finalize.
 * For night shifts the window closes at the shift start of the following day,
 * so the morning out punch is in before the day can be locked.
 */
export function isFinalizable(
  istDay: Date,
  now = new Date(),
  shift?: Pick<Shift, "isNightShift" | "startTime"> | null
): boolean {
  const { end } = shiftWindow(istDay, shift ?? null);
  return now.getTime() > end.getTime() + FINALIZE_GRACE_HOURS * 3600 * 1000;
}

/**
 * Lazy finalization: after the window closes, re-derive non-finalized days so
 * late-arriving punches can't keep mutating them and lone-punch days get
 * flagged. Bounded per call so a read path or cron tick can never hang — a
 * backlog drains over successive calls (oldest first).
 */
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
    const employee = await prisma.employee.findUnique({
      where: { id: row.employeeId },
      select: { id: true, shiftId: true, tenantId: true, branchId: true },
    });
    if (!employee) continue;
    const shift = employee.shiftId ? await prisma.shift.findUnique({ where: { id: employee.shiftId } }) : null;
    if (!isFinalizable(row.date, undefined, shift)) continue;
    await reconcileEmployeeDay(tenant, employee, row.date, { finalize: true });
    count++;
  }
  return count;
}

/** Day key of the IST calendar day containing `d`, e.g. "2026-08-12". */
export function istDayKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
