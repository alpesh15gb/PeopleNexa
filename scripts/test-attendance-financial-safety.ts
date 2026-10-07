import assert from "node:assert/strict";
import { attendanceRequiresReview } from "../lib/attendance-validation";
import { attendanceSummary } from "../lib/payroll";
import { buildWorkSummary, buildDeviceMonthly, buildPerformance } from "../lib/device-report";
import { parseIST } from "../lib/ist";
const first = parseIST("2026-10-01 08:06:00")!;
const last = parseIST("2026-10-02 08:05:00")!;
const record = { employeeId: "e", date: parseIST("2026-10-01 00:00:00")!, status: "present", reviewStatus: "needs_review", lateMinutes: 0, overtimeMinutes: 900, punchInTime: first, punchOutTime: last, punches: [{ time: first.toISOString(), type: "in" }, { time: last.toISOString(), type: "out" }], shift: null };
const args = { tenant: { name: "Test" }, branch: null, month: "2026-10", employees: [{ id: "e", employeeNumber: "E", firstName: "Test", lastName: "Employee", position: null, shift: null }], records: [record], punchesByDay: new Map(), leaves: new Set<string>(), holidays: new Set<string>(), runBy: "Admin", generatedAt: "Test" };
assert.equal(attendanceRequiresReview({ ...record, reviewStatus: null }), true, "legacy implausible records cannot bypass a missing flag");
assert.equal(attendanceRequiresReview({ ...record, punchOutTime: new Date(first.getTime() - 1), reviewStatus: null }), true);
assert.equal(attendanceRequiresReview({ ...record, punchOutTime: new Date(first.getTime() + 8 * 3600000), reviewStatus: null }), false);
const work = buildWorkSummary(args).blocks[0];
assert.equal(work.rows[0].work, "Review");
assert.equal(work.totals.work, "0:00");
assert.equal(work.totals.overtime, "0:00");
assert.equal(buildDeviceMonthly(args).blocks[0].summary.totalOvertime, "00:00");
assert.equal(buildPerformance(args).blocks[0].totals.work, "0:00");
assert.equal(buildPerformance(args).blocks[0].totals.ot, "0:00");
const db: any = { attendance: { findMany: async () => [record] }, leaveRequest: { findMany: async () => [] }, holiday: { findMany: async () => [] }, shift: { findUnique: async () => null }, rosterAssignment: { findMany: async () => [] } };
async function main() {
  await assert.rejects(attendanceSummary("t", { id: "e", shiftId: null, joiningDate: null }, "2026-10", true, db), /Payroll blocked.*2026-10-01/);
  db.attendance.findMany = async () => [{ ...record, reviewStatus: null, punchOutTime: new Date(first.getTime() + 8 * 3600000) }];
  const valid = await attendanceSummary("t", { id: "e", shiftId: null, joiningDate: null }, "2026-10", true, db);
  assert.equal(valid.workedHours, 8, "valid attendance still contributes payable hours");
  console.log("attendance financial safety tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
