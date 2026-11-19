import assert from "node:assert/strict";
import { attendanceDayKey, attendanceWindow, isFinalizable, pairPunches, punchDayForShift, shiftWindow, missingOutAttendanceStatus } from "../lib/reconcile";
import { parseIST } from "../lib/ist";
import { DEFAULT_WORKSPACE_REGION, formatRegionalMoney, parseWorkspaceRegion, supportsIndiaPayroll, workspaceRegion } from "../lib/workspace-region";
import { dateKeyInTimeZone, parseWorkspaceWallTime, timeZoneDayRange } from "../lib/workspace-time";

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

const zone = "America/New_York";
const spring = timeZoneDayRange("2026-03-08", zone);
assert.equal(spring.start.toISOString(), "2026-03-08T05:00:00.000Z");
assert.equal(spring.end.toISOString(), "2026-03-09T04:00:00.000Z");
const fall = timeZoneDayRange("2026-11-01", zone);
assert.equal(fall.start.toISOString(), "2026-11-01T04:00:00.000Z");
assert.equal(fall.end.toISOString(), "2026-11-02T05:00:00.000Z");
assert.equal(parseWorkspaceWallTime("2026-03-08T02:30", zone), null, "skipped local hours are rejected for manual punch entry");
assert.equal(parseWorkspaceWallTime("2026-11-01T01:30", zone)?.toISOString(), "2026-11-01T05:30:00.000Z", "repeated local hours select the earlier instant");
assert.equal(dateKeyInTimeZone(new Date("2026-03-08T03:30:00Z"), zone), "2026-03-07");
const overnightWindow = shiftWindow(ist("2026-03-07 00:00:00"), nightShift, zone);
assert.equal(overnightWindow.start.toISOString(), "2026-03-08T02:00:00.000Z");
assert.equal(overnightWindow.end.toISOString(), "2026-03-09T01:00:00.000Z");
assert.equal(punchDayForShift(new Date("2026-03-08T11:00:00Z"), nightShift, zone).toISOString(), ist("2026-03-07 00:00:00").toISOString());

assert.deepEqual(workspaceRegion(null), DEFAULT_WORKSPACE_REGION);
assert.equal(supportsIndiaPayroll(workspaceRegion(null)), true);
const unitedKingdom = parseWorkspaceRegion({ countryCode: "gb", currency: "gbp", locale: "en-gb", timeZone: "Europe/London" });
assert.deepEqual(unitedKingdom, { countryCode: "GB", currency: "GBP", locale: "en-GB", timeZone: "Europe/London" });
assert.equal(supportsIndiaPayroll(unitedKingdom!), false);
assert.equal(formatRegionalMoney(1234.5, unitedKingdom!), "£1,234.50");
assert.equal(parseWorkspaceRegion({ ...unitedKingdom, timeZone: "+05:30" }), null);
assert.equal(parseWorkspaceRegion({ ...unitedKingdom, currency: "XYZ" }), null);
