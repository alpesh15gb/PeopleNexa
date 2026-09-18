import assert from "node:assert/strict";
import { attendanceDayKey, punchDayForShift, shiftWindow } from "../lib/reconcile";
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

console.log("attendance day-key tests passed");
