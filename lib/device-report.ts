// eBioserver-style Daily + Monthly attendance report builders.
// Pure functions only (no prisma, no I/O). All wall-clock formatting goes
// through lib/ist + lib/dates helpers so output stays IST-consistent.

import { istDateKey, istWallClock } from "./ist";
import { minutesOfDay } from "./dates";

export interface DeviceShift {
  name: string;
  startTime: string; // "09:00"
  endTime: string; // "18:00"
}

export interface DeviceEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  shift: DeviceShift | null;
}

export interface DeviceRecord {
  employeeId: string;
  date: Date;
  status: string; // present | late | permission | half_day | absent
  lateMinutes: number;
  overtimeMinutes: number;
  punchInTime: Date | null;
  punchOutTime: Date | null;
  /** Attendance.punches snapshot: entries shaped { time, type }. */
  punches: unknown;
  shift: DeviceShift | null;
}

/** Raw-punch fallback entry (Punch table shape, IST instants). */
export interface SnapshotPunch {
  time: string | Date;
  type?: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** HH:MM (24h, IST). Blank when missing/invalid. */
export function formatClockIST(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const w = istWallClock(dt);
  return `${pad2(w.getUTCHours())}:${pad2(w.getUTCMinutes())}`;
}

/** Minutes since IST midnight for a stored instant, or null when missing. */
export function istMinutesOfDay(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const w = istWallClock(dt);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

/** H:MM for spans (e.g. 75 → "1:15"). */
export function formatHM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`;
}

/** HH:MM zero-padded totals (e.g. 75 → "01:15"). */
export function formatHHMM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-12" → "12-Aug-2026". */
export function formatDayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${m[3]}-${MON3[Number(m[2]) - 1] ?? m[2]}-${m[1]}`;
}

/** "2026-08" → "Aug-2026". */
export function formatMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${MON3[Number(m[2]) - 1] ?? m[2]}-${m[1]}`;
}

/** IST day keys for a calendar month ("2026-08" → ["2026-08-01", …]). */
export function monthDays(monthKey: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return [];
  const daysInMonth = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(`${m[1]}-${m[2]}-${pad2(d)}`);
  }
  return out;
}

/** Sundays are weekly offs (same probe convention as the reports route). */
export function isSundayDayKey(dayKey: string): boolean {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay() === 0;
}

export function shiftLabel(shift: DeviceShift | null): string {
  if (!shift) return "—";
  return `${shift.name} (${shift.startTime}-${shift.endTime})`;
}

function fullName(emp: DeviceEmployee): string {
  return `${emp.firstName} ${emp.lastName}`.trim();
}

// ─── Punches snapshot ("HH:MMIN;HH:MMOUT;") ────────────────────────────────

interface ParsedPunch {
  time: Date;
  type: string;
}

function parseSnapshotPunches(snapshot: unknown): ParsedPunch[] {
  if (!Array.isArray(snapshot)) return [];
  const out: ParsedPunch[] = [];
  for (const e of snapshot) {
    if (!e || typeof e !== "object") continue;
    const rec = e as { time?: unknown; type?: unknown };
    const t = rec.time instanceof Date ? rec.time : typeof rec.time === "string" ? new Date(rec.time) : null;
    if (!t || Number.isNaN(t.getTime())) continue;
    out.push({ time: t, type: typeof rec.type === "string" ? rec.type : "" });
  }
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

function suffixFor(entries: ParsedPunch[], i: number): string {
  const t = (entries[i].type || "").toLowerCase();
  if (t === "in") return "IN";
  if (t === "out") return "OUT";
  // No usable hint → first=IN / last=OUT, middles alternate from IN.
  if (entries.length === 1) return "IN";
  if (i === 0) return "IN";
  if (i === entries.length - 1) return "OUT";
  return i % 2 === 0 ? "IN" : "OUT";
}

/** "HH:MMIN;HH:MMOUT;" from the snapshot, falling back to raw punches. */
export function punchesText(snapshot: unknown, fallback?: SnapshotPunch[]): string {
  let entries = parseSnapshotPunches(snapshot);
  if (entries.length === 0 && fallback && fallback.length > 0) {
    entries = fallback
      .map((f) => {
        const t = f.time instanceof Date ? f.time : new Date(f.time);
        if (Number.isNaN(t.getTime())) return null;
        return { time: t, type: f.type ?? "" };
      })
      .filter((e): e is ParsedPunch => e !== null)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }
  if (entries.length === 0) return "";
  return entries.map((e, i) => `${formatClockIST(e.time)}${suffixFor(entries, i)}`).join(";") + ";";
}

// ─── Shared per-day cells ──────────────────────────────────────────────────

interface DayCells {
  inTime: string;
  outTime: string;
  late: string;
  early: string;
  duration: string;
  overtime: string;
  punches: string;
  earlyMinutes: number;
  durationMinutes: number;
}

function buildDayCells(
  record: DeviceRecord | undefined,
  employeeShift: DeviceShift | null,
  fallback: SnapshotPunch[] | undefined,
): DayCells {
  const empty: DayCells = {
    inTime: "",
    outTime: "",
    late: "",
    early: "",
    duration: "",
    overtime: "",
    punches: "",
    earlyMinutes: 0,
    durationMinutes: 0,
  };
  if (!record) return empty;
  const inTime = formatClockIST(record.punchInTime);
  const outTime = formatClockIST(record.punchOutTime);
  const late = record.lateMinutes > 0 ? formatHM(record.lateMinutes) : "";
  const overtime = record.overtimeMinutes > 0 ? formatHM(record.overtimeMinutes) : "";

  // Early-going = max(0, shiftEnd − out) when both exist, else blank.
  let early = "";
  let earlyMinutes = 0;
  const shift = record.shift ?? employeeShift;
  const outMin = istMinutesOfDay(record.punchOutTime);
  if (shift && outMin !== null) {
    const endMin = minutesOfDay(shift.endTime);
    if (shift.endTime && /^\d{2}:\d{2}$/.test(shift.endTime)) {
      earlyMinutes = Math.max(0, endMin - outMin);
      early = earlyMinutes > 0 ? formatHM(earlyMinutes) : "";
    }
  }

  // Duration = H:MM span out−in when both exist, else blank.
  let duration = "";
  let durationMinutes = 0;
  if (record.punchInTime && record.punchOutTime) {
    const diff = Math.round((record.punchOutTime.getTime() - record.punchInTime.getTime()) / 60000);
    if (diff >= 0) {
      durationMinutes = diff;
      duration = formatHM(diff);
    }
  }

  return {
    inTime,
    outTime,
    late,
    early,
    duration,
    overtime,
    punches: punchesText(record.punches, fallback),
    earlyMinutes,
    durationMinutes,
  };
}

// ─── Daily ─────────────────────────────────────────────────────────────────

export interface DeviceDailyRow extends Omit<DayCells, "earlyMinutes" | "durationMinutes"> {
  code: string;
  name: string;
  designation: string;
  shift: string;
  status: string; // P | ½P | L | A
}

export interface DeviceDailyOutput {
  kind: "daily";
  day: string;
  dayLabel: string;
  header: { left: string; center: string; right: string };
  columns: string[];
  rows: DeviceDailyRow[];
}

export const DEVICE_DAILY_COLUMNS = [
  "Employee Code",
  "Employee Name",
  "Designation",
  "Shift",
  "InTime",
  "OutTime",
  "Late",
  "Early",
  "Duration",
  "Overtime",
  "Punches",
  "Status",
];

export function buildDeviceDaily(args: {
  tenant: { name: string };
  branch: { name: string } | null;
  day: string; // YYYY-MM-DD
  employees: DeviceEmployee[];
  records: DeviceRecord[];
  /** Keyed `${employeeId}|${dayKey}` (raw-punch fallback when snapshot empty). */
  punchesByDay: Map<string, SnapshotPunch[]>;
  /** Employee ids on approved leave for the day. */
  leaves: Set<string>;
  /** IST day keys that are tenant holidays. */
  holidays: Set<string>;
}): DeviceDailyOutput {
  const { tenant, branch, day, employees, records, punchesByDay, leaves } = args;
  const byEmployee = new Map(records.map((r) => [r.employeeId, r]));
  const rows: DeviceDailyRow[] = employees.map((emp) => {
    const record = byEmployee.get(emp.id);
    const cells = buildDayCells(record, emp.shift, punchesByDay.get(`${emp.id}|${day}`));
    let status = "A";
    if (record) status = record.status === "half_day" ? "½P" : "P";
    else if (leaves.has(emp.id)) status = "L";
    const { earlyMinutes: _e, durationMinutes: _d, ...rest } = cells;
    return {
      ...rest,
      code: emp.employeeNumber,
      name: fullName(emp),
      designation: emp.position ?? "—",
      shift: shiftLabel(record?.shift ?? emp.shift),
      status,
    };
  });
  return {
    kind: "daily",
    day,
    dayLabel: formatDayLabel(day),
    header: {
      left: `${tenant.name} - ${branch?.name ?? "All Branches"}`,
      center: "Daily Attendance Report",
      right: formatDayLabel(day),
    },
    columns: DEVICE_DAILY_COLUMNS,
    rows,
  };
}

// ─── Monthly ───────────────────────────────────────────────────────────────

export interface DeviceMonthlyDayRow {
  day: number;
  dayKey: string;
  status: string; // P | ½P | L | A | WO | H
  shift: string;
  inTime: string;
  outTime: string;
  lateBy: string;
  earlyBy: string;
  duration: string;
  overTime: string;
}

export interface DeviceMonthlySummary {
  present: number;
  absent: number;
  leaves: number;
  compOffs: 0;
  weeklyOffs: number;
  holidays: number;
  wop: 0;
  hp: 0;
  totalLate: string;
  totalEarly: string;
  totalDuration: string;
  totalOvertime: string;
}

export interface DeviceMonthlyBlock {
  code: string;
  name: string;
  designation: string;
  summary: DeviceMonthlySummary;
  summaryLine: string;
  days: DeviceMonthlyDayRow[];
}

export interface DeviceMonthlyOutput {
  kind: "monthly";
  month: string;
  monthLabel: string;
  header: { left: string; center: string; right: string };
  columns: string[];
  blocks: DeviceMonthlyBlock[];
}

export const DEVICE_MONTHLY_COLUMNS = [
  "Day",
  "Status",
  "Shift",
  "InTime",
  "OutTime",
  "LateBy",
  "EarlyBy",
  "Duration",
  "OverTime",
];

const PRESENT_STATUSES = new Set(["present", "late", "permission", "half_day"]);

export function buildDeviceMonthly(args: {
  tenant: { name: string };
  branch: { name: string } | null;
  month: string; // YYYY-MM
  employees: DeviceEmployee[];
  records: DeviceRecord[];
  /** Keyed `${employeeId}|${dayKey}` (raw-punch fallback when snapshot empty). */
  punchesByDay: Map<string, SnapshotPunch[]>;
  /** `${employeeId}|${dayKey}` keys for approved-leave days. */
  leaves: Set<string>;
  /** IST day keys that are tenant holidays. */
  holidays: Set<string>;
}): DeviceMonthlyOutput {
  const { tenant, branch, month, employees, records, punchesByDay, leaves, holidays } = args;
  const days = monthDays(month);
  const byKey = new Map(records.map((r) => [`${r.employeeId}|${istDateKey(r.date)}`, r]));

  const blocks: DeviceMonthlyBlock[] = employees.map((emp) => {
    let present = 0;
    let leaveCount = 0;
    let weeklyOffs = 0;
    let holidayCount = 0;
    let lateSum = 0;
    let earlySum = 0;
    let durationSum = 0;
    let otSum = 0;

    const rows: DeviceMonthlyDayRow[] = days.map((dayKey, idx) => {
      const record = byKey.get(`${emp.id}|${dayKey}`);
      const cells = buildDayCells(record, emp.shift, punchesByDay.get(`${emp.id}|${dayKey}`));
      let status: string;
      if (holidays.has(dayKey)) {
        status = "H";
        holidayCount++;
      } else if (isSundayDayKey(dayKey)) {
        status = "WO";
        weeklyOffs++;
      } else if (leaves.has(`${emp.id}|${dayKey}`)) {
        status = "L";
        leaveCount++;
      } else if (record && PRESENT_STATUSES.has(record.status)) {
        status = record.status === "half_day" ? "½P" : "P";
        present++;
        lateSum += Math.max(0, record.lateMinutes);
        earlySum += cells.earlyMinutes;
        durationSum += cells.durationMinutes;
        otSum += Math.max(0, record.overtimeMinutes);
      } else {
        status = "A";
      }
      return {
        day: idx + 1,
        dayKey,
        status,
        shift: shiftLabel(record?.shift ?? emp.shift),
        inTime: status === "P" || status === "½P" ? cells.inTime : "",
        outTime: status === "P" || status === "½P" ? cells.outTime : "",
        lateBy: status === "P" || status === "½P" ? cells.late : "",
        earlyBy: status === "P" || status === "½P" ? cells.early : "",
        duration: status === "P" || status === "½P" ? cells.duration : "",
        overTime: status === "P" || status === "½P" ? cells.overtime : "",
      };
    });

    const absent = Math.max(days.length - present - leaveCount - weeklyOffs - holidayCount, 0);
    const summary: DeviceMonthlySummary = {
      present,
      absent,
      leaves: leaveCount,
      compOffs: 0,
      weeklyOffs,
      holidays: holidayCount,
      wop: 0,
      hp: 0,
      totalLate: formatHHMM(lateSum),
      totalEarly: formatHHMM(earlySum),
      totalDuration: formatHHMM(durationSum),
      totalOvertime: formatHHMM(otSum),
    };
    const summaryLine =
      `Present: ${summary.present} Absent: ${summary.absent} Leaves: ${summary.leaves} ` +
      `CompOffs: 0 Weekly Offs: ${summary.weeklyOffs} Holidays: ${summary.holidays} WOP: 0 HP: 0 ` +
      `Total Late: ${summary.totalLate} Total Early: ${summary.totalEarly} ` +
      `Total Duration: ${summary.totalDuration} Total OverTime: ${summary.totalOvertime}`;
    return {
      code: emp.employeeNumber,
      name: fullName(emp),
      designation: emp.position ?? "—",
      summary,
      summaryLine,
      days: rows,
    };
  });

  return {
    kind: "monthly",
    month,
    monthLabel: formatMonthLabel(month),
    header: {
      left: `${tenant.name} - ${branch?.name ?? "All Branches"}`,
      center: "Monthly Attendance Report",
      right: formatMonthLabel(month),
    },
    columns: DEVICE_MONTHLY_COLUMNS,
    blocks,
  };
}
