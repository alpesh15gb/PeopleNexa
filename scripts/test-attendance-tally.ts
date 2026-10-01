import assert from "node:assert/strict";
import { tallyDailyAttendance } from "../lib/attendance-tally";
import { dailyPresentEmployeeCounts } from "../lib/attendance-presence";

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

const dailyPresence = dailyPresentEmployeeCounts(
  [
    { employeeId: "reconciled", date: new Date("2026-10-01T18:30:00.000Z"), status: "present" },
    { employeeId: "also-punched", date: new Date("2026-10-01T18:30:00.000Z"), status: "late" },
    { employeeId: "final-absent", date: new Date("2026-10-01T18:30:00.000Z"), status: "absent" },
  ],
  [
    // Both timestamps are 2 October in IST; the same employee counts once.
    { employeeId: "raw-only", punchTime: new Date("2026-10-01T19:00:00.000Z"), authStatus: "auto" },
    { employeeId: "raw-only", punchTime: new Date("2026-10-02T04:00:00.000Z"), authStatus: "approved" },
    { employeeId: "also-punched", punchTime: new Date("2026-10-02T03:30:00.000Z"), authStatus: "auto" },
    { employeeId: "final-absent", punchTime: new Date("2026-10-02T03:30:00.000Z"), authStatus: "approved" },
    { employeeId: "pending", punchTime: new Date("2026-10-02T03:30:00.000Z"), authStatus: "pending" },
  ],
);
assert.equal(dailyPresence.get("2026-10-02"), 4, "daily present is deduplicated and includes authorized raw punches without changing absent status");

console.log("attendance tally tests passed");
