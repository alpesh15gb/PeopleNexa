import assert from "node:assert/strict";
import { attendanceDrilldownStatus, attendanceEmployeeScope, attendanceStatusFilter } from "../lib/attendance-drilldown";
import { authorizedPunchDayFilter } from "../lib/attendance-presence";

const start = new Date("2026-09-25T00:00:00.000Z");
const end = new Date("2026-09-26T00:00:00.000Z");

assert.equal(attendanceDrilldownStatus("present"), "present");
assert.equal(attendanceDrilldownStatus("late"), "late");
assert.equal(attendanceDrilldownStatus("half_day"), null);
assert.deepEqual(attendanceStatusFilter("present", start, end), {
  punches: { some: { punchTime: { gte: start, lt: end }, authStatus: { in: ["auto", "approved"] } } },
});
assert.deepEqual(authorizedPunchDayFilter(start, end), {
  punchTime: { gte: start, lt: end }, authStatus: { in: ["auto", "approved"] },
});
assert.deepEqual(attendanceEmployeeScope({ tenantId: "tenant-a", branchId: "branch-a" }), {
  tenantId: "tenant-a", status: "active", loginOnly: false, branchId: "branch-a",
});
assert.deepEqual(attendanceEmployeeScope({ tenantId: "tenant-a", locationId: "location-a" }), {
  tenantId: "tenant-a", status: "active", loginOnly: false, branch: { locationId: "location-a" },
});
assert.deepEqual(attendanceEmployeeScope({ tenantId: "tenant-a", locationId: "location-a", branchId: "branch-a" }), {
  tenantId: "tenant-a", status: "active", loginOnly: false, branch: { locationId: "location-a" }, branchId: "branch-a",
});

console.log("attendance drilldown tests passed");
