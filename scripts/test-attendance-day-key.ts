import assert from "node:assert/strict";
import { attendanceDayKey, attendanceWindow, isFinalizable, pairPunches, punchDayForShift, shiftWindow, missingOutAttendanceStatus } from "../lib/reconcile";
import { parseIST } from "../lib/ist";

const ist = (value: string) => parseIST(value)!;
const nightShift = { isNightShift: true, startTime: "22:00" };
const dayShift = { isNightShift: false, startTime: "09:00" };

const nightDay = ist("2026-08-12 00:00:00");
const nightWindow = shiftWindow(nightDay, nightShift);

assert.equal(attendanceDayKey(nightDay).toISOString(), ist("2026-08-12 00:00:00").toISOString());
assert.equal(nightWindow.start.toISOString(), ist("2026-08-12 21:00:00").toISOString());
assert.equal(punchDayForShift(ist("2026-08-13 06:00:00"), nightShift).toISOString(), nightDay.toISOString());
assert.equal(punchDayForShift(ist("2026-08-13 06:00:00"), dayShift).toISOString(), ist("2026-08-13 00:00:00").toISOString());
assert.equal(attendanceDayKey(nightWindow.start).toISOString(), nightDay.toISOString());
assert.equal(missingOutAttendanceStatus(true, new Date(), null, "half_day"), "half_day");
assert.equal(missingOutAttendanceStatus(true, new Date(), null, "full_day"), "absent");
assert.equal(missingOutAttendanceStatus(false, new Date(), null, "half_day"), null);

const noShiftIn = ist("2026-08-12 09:00:00");
const noShiftWindow = attendanceWindow(nightDay, null, 18, noShiftIn);
assert.equal(noShiftWindow.end.toISOString(), ist("2026-08-13 00:00:00").toISOString(), "without an overnight shift the window stops at IST midnight");
assert.equal(isFinalizable(nightDay, ist("2026-08-13 05:01:00"), null, 18, noShiftIn), true, "no-shift IN-only days finalize after their window and normal grace");
assert.equal(missingOutAttendanceStatus(true, ist("2026-08-12 09:00:00"), null, "half_day"), "half_day", "a finalized no-shift IN-only day follows the location half-day policy");
assert.equal(missingOutAttendanceStatus(true, ist("2026-08-12 09:00:00"), null, "full_day"), "absent", "a finalized no-shift IN-only day follows the location full-day policy");
assert.equal(missingOutAttendanceStatus(true, ist("2026-08-12 09:00:00"), null, "review"), null, "review policy leaves a finalized no-shift IN-only day for review");
const pairedNoShiftPunches = pairPunches([
  { id: "in", punchTime: ist("2026-08-12 09:00:00"), source: "device", inOutHint: "unknown", deviceId: null },
  { id: "out", punchTime: ist("2026-08-13 02:00:00"), source: "device", inOutHint: "unknown", deviceId: null },
] .filter((p) => p.punchTime < attendanceWindow(nightDay, null, 24, noShiftIn).end) as never, "first_last", new Map());
assert.deepEqual(pairedNoShiftPunches.map((p) => p.type), ["in"], "a missing OUT stays missing; the next-day punch is outside this day");
assert.deepEqual(attendanceWindow(nightDay, dayShift, 18), shiftWindow(nightDay, dayShift), "configured no-shift windows do not change shift attendance windows");

console.log("attendance day-key tests passed");
const repeatedIns = pairPunches([
  { id: "one", punchTime: ist("2026-08-12 09:00:00"), source: "device", inOutHint: "in", deviceId: null },
  { id: "two", punchTime: ist("2026-08-12 10:00:00"), source: "device", inOutHint: "in", deviceId: null },
] as never, "first_last", new Map());
assert.equal(repeatedIns.some((p) => p.type === "out"), false, "repeated IN punches cannot become OUT");
assert.equal(ist("2026-08-13 08:00:00") < attendanceWindow(nightDay, null, 24, noShiftIn).end, false, "next morning is excluded from an unassigned day");
