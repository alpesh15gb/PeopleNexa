import { istStartOfDay } from "./ist";
import { minutesOfDay } from "./dates";

export const AUTOMATIC_SHIFT_KIND = "branch_automatic_shifts";
export type AutomaticShiftPolicy = { enabled: boolean; shiftIds: string[]; earlyMinutes: number; lateMinutes: number; outMinutes: number };
export const DEFAULT_AUTOMATIC_SHIFT_POLICY: AutomaticShiftPolicy = { enabled: false, shiftIds: [], earlyMinutes: 180, lateMinutes: 240, outMinutes: 120 };
export function automaticShiftPolicy(value: unknown): AutomaticShiftPolicy | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AutomaticShiftPolicy;
  if (typeof v.enabled !== "boolean" || !Array.isArray(v.shiftIds) || v.shiftIds.some((id) => typeof id !== "string" || !id) || new Set(v.shiftIds).size !== v.shiftIds.length) return null;
  if ([v.earlyMinutes, v.lateMinutes, v.outMinutes].some((n) => !Number.isInteger(n) || n < 0 || n > 720)) return null;
  if (v.enabled && v.shiftIds.length < 2) return null;
  return { enabled: v.enabled, shiftIds: v.shiftIds, earlyMinutes: v.earlyMinutes, lateMinutes: v.lateMinutes, outMinutes: v.outMinutes };
}
type TimedShift = { id: string; startTime: string; endTime: string; isNightShift: boolean };
export function automaticShiftWindow(day: Date, shift: TimedShift, policy: AutomaticShiftPolicy) {
  const midnight = istStartOfDay(day).getTime();
  const start = midnight + minutesOfDay(shift.startTime) * 60000;
  const end = midnight + (minutesOfDay(shift.endTime) + (shift.isNightShift ? 1440 : 0)) * 60000;
  return { start: new Date(start - policy.earlyMinutes * 60000), end: new Date(end + policy.outMinutes * 60000) };
}
/** Match only configured start windows; ties are ambiguous, never guessed. */
export function detectAutomaticShift<T extends TimedShift>(day: Date, instant: Date, shifts: T[], policy: AutomaticShiftPolicy): T | null {
  if (!policy.enabled) return null;
  const candidates = shifts.filter((s) => policy.shiftIds.includes(s.id)).map((shift) => ({ shift, delta: (instant.getTime() - istStartOfDay(day).getTime()) / 60000 - minutesOfDay(shift.startTime) })).filter((c) => c.delta >= -policy.earlyMinutes && c.delta <= policy.lateMinutes).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  if (!candidates.length || (candidates[1] && Math.abs(candidates[0].delta) === Math.abs(candidates[1].delta))) return null;
  return candidates[0].shift;
}
