import assert from "node:assert/strict";
import { buildDeviceDaily, type DeviceEmployee, type DeviceRecord, type SnapshotPunch } from "../lib/device-report";
import { tallyDailyAttendance } from "../lib/attendance-tally";

const day = "2026-10-06";
const time = new Date("2026-10-06T03:30:00Z");
const employees: DeviceEmployee[] = Array.from({ length: 253 }, (_, i) => ({
  id: String(i), employeeNumber: String(i), firstName: "Employee", lastName: String(i), position: null, shift: null,
}));
const records: DeviceRecord[] = employees.slice(0, 58).map((employee) => ({
  employeeId: employee.id, date: new Date("2026-10-05T18:30:00Z"), status: "present",
  lateMinutes: 0, overtimeMinutes: 0, punchInTime: time, punchOutTime: null, punches: [], shift: null,
}));
// A stale absent record must not hide an authorized scan.
records.push({ ...records[0], employeeId: "58", status: "absent", punchInTime: null });
const punchesByDay = new Map<string, SnapshotPunch[]>(employees.slice(0, 131).map((employee) => [
  `${employee.id}|${day}`, [{ time, type: "in" }, { time, type: "in" }],
]));
const args = { tenant: { name: "Test" }, branch: null, day, employees, records, punchesByDay, leaves: new Set<string>(), holidays: new Set<string>() };
const output = buildDeviceDaily(args);
const tally = tallyDailyAttendance(employees.map((e) => e.id), records, [], employees.slice(0, 131).map((e) => e.id));
assert.equal(output.rows.length, 253);
assert.equal(output.rows.filter((r) => r.status === "P").length, 131);
assert.equal(output.rows.filter((r) => r.status === "A").length, 122);
assert.equal(tally.livePresent, 131);
assert.equal(tally.liveAbsent, 122);
assert.equal(output.rows[58].attendanceStatus, "absent");
assert.equal(output.rows[59].attendanceStatus, "Pending");
assert.equal(output.rows[59].inTime, "09:00");
assert.equal(output.rows[59].outTime, "", "repeated IN scans must not invent an OUT");
assert.ok(output.rows[59].punches);
assert.equal(output.rows[59].duration, "", "pending reconciliation must not invent work duration");
assert.equal(records[58].status, "absent", "report must not mutate payroll records");
const leaveOutput = buildDeviceDaily({ ...args, leaves: new Set(["58", "200"]) });
assert.equal(leaveOutput.rows[58].status, "P", "authorized presence takes priority over leave");
assert.equal(leaveOutput.rows[200].status, "L");
console.log("daily report presence regression tests passed");
