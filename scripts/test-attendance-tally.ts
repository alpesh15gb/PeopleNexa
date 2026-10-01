import assert from "node:assert/strict";
import { tallyDailyAttendance } from "../lib/attendance-tally";

const punchIn = new Date("2026-10-02T03:30:00.000Z");
const tally = tallyDailyAttendance(
  ["raw-punch", "reconciled-only", "present", "absent"],
  [
    // Reconciled attendance does not drive the real-time KPI.
    { employeeId: "reconciled-only", status: "absent", punchInTime: punchIn },
    { employeeId: "present", status: "present", punchInTime: punchIn },
    { employeeId: "absent", status: "absent", punchInTime: null },
    // Rows outside the scoped employee population must not affect the KPI.
    { employeeId: "other-location", status: "present", punchInTime: punchIn },
  ],
  [],
  ["raw-punch", "raw-punch", "present", "other-location"],
);

assert.equal(tally.livePresent, 2, "only distinct scoped authorized raw-punch employees are present");
assert.equal(tally.present, 1, "finalized status buckets remain unchanged");
assert.equal(tally.absent, 2, "missing-OUT policy treatment remains unchanged");

console.log("attendance tally tests passed");
