import type { Shift } from "@/generated/prisma/client";
import { minutesOfDay } from "./dates";
import { IST_OFFSET_MS } from "./ist";

export type AttendanceStatus = "present" | "late" | "permission" | "absent" | "half_day";

export interface StatusResult {
  status: AttendanceStatus;
  lateMinutes: number;
}

/**
 * Determine attendance status from the punch-in time vs the employee's shift.
 * Punch-in before shift start + grace → present. After → late (with minutes).
 */
export function computePunchStatus(shift: Pick<Shift, "startTime" | "graceMinutes"> | null, punchIn: Date): StatusResult {
  if (!shift) return { status: "present", lateMinutes: 0 };
  const shiftStart = minutesOfDay(shift.startTime);
  const punchMinutes = punchIn.getHours() * 60 + punchIn.getMinutes();
  const grace = shift.graceMinutes ?? 0;

  // Night shift (e.g. 22:00 → 06:00): the punch happens after the start time on
  // the same or previous day. Treated as late only if past start + grace.
  const late = punchMinutes - (shiftStart + grace);
  if (late > 0) return { status: "late", lateMinutes: late };
  return { status: "present", lateMinutes: 0 };
}

/**
 * Same as computePunchStatus but evaluated against the IST wall clock
 * explicitly — correct no matter which timezone the server host runs in.
 * Used for device punches and the reconciliation engine.
 */
export function computePunchStatusIST(shift: Pick<Shift, "startTime" | "graceMinutes"> | null, punchIn: Date): StatusResult {
  if (!shift) return { status: "present", lateMinutes: 0 };
  const ist = new Date(punchIn.getTime() + IST_OFFSET_MS);
  const punchMinutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const shiftStart = minutesOfDay(shift.startTime);
  const grace = shift.graceMinutes ?? 0;
  const late = punchMinutes - (shiftStart + grace);
  if (late > 0) return { status: "late", lateMinutes: late };
  return { status: "present", lateMinutes: 0 };
}

export const STATUS_META: Record<AttendanceStatus, { label: string; color: string; dot: string }> = {
  present: { label: "Present", color: "text-emerald-300", dot: "bg-emerald-400" },
  late: { label: "Late", color: "text-amber-300", dot: "bg-amber-400" },
  permission: { label: "Permission", color: "text-sky-300", dot: "bg-sky-400" },
  absent: { label: "Absent", color: "text-rose-300", dot: "bg-rose-400" },
  half_day: { label: "Half Day", color: "text-violet-300", dot: "bg-violet-400" },
};
