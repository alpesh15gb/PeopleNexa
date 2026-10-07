
import { pairPunches, HALF_DAY_HOURS, MAX_SPAN_HOURS, type PunchMode } from "./reconcile";

export function crossDayRepairPlan(
  punches: Parameters<typeof pairPunches>[0],
  mode: PunchMode,
  singlePunchHalfDay: boolean,
) {
  const entries = pairPunches(punches, mode, new Map());
  const inEntry = entries.find((entry) => entry.type === "in");
  const outEntry = [...entries].reverse().find((entry) => entry.type === "out");
  const punchInTime = inEntry ? new Date(inEntry.time) : null;
  const punchOutTime = outEntry ? new Date(outEntry.time) : null;
  if (punches.length === 1) {
    if (!singlePunchHalfDay) return { eligible: false as const, reason: "Single-punch half-day rule is disabled; leave unchanged", entries };
    return { eligible: true as const, reason: "Single punch: configured half-day rule", entries, data: { punchInTime, punchOutTime, status: "half_day", lateMinutes: 0, overtimeMinutes: 0, reviewStatus: null } };
  }
  if (!punchInTime || !punchOutTime) return { eligible: false as const, reason: "No complete same-day pair; leave unchanged", entries };
  const hours = (punchOutTime.getTime() - punchInTime.getTime()) / 3600000;
  if (hours <= 0 || hours > MAX_SPAN_HOURS) return { eligible: false as const, reason: "Invalid or implausible same-day span; leave unchanged", entries };
  return { eligible: true as const, reason: "Rebuilt from authorized same-day punches", entries, data: { punchInTime, punchOutTime, status: hours < HALF_DAY_HOURS ? "half_day" : "present", lateMinutes: 0, overtimeMinutes: 0, reviewStatus: null } };
}
