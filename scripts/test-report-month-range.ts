import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIST } from "../lib/ist";
import { istDateKey } from "../lib/ist";
import { buildStatusMatrix } from "../lib/device-report";

const month = "2026-02";
const start = parseIST(`${month}-01 00:00:00`)!;
const days = new Date(Date.UTC(2026, 2, 0)).getDate();
const keys = Array.from({ length: days }, (_, n) => istDateKey(new Date(start.getTime() + n * 86400000)));
assert.equal(keys.length, 28);
assert.equal(keys[0], "2026-02-01");
assert.equal(keys.at(-1), "2026-02-28");

const matrix = buildStatusMatrix({
  tenant: { name: "Fixture Company" },
  branch: { name: "Fixture Branch" },
  department: null,
  month: "2026-02",
  employees: [{ id: "employee-1", employeeNumber: "EMP-001", firstName: "Asha", lastName: "Das", position: "Analyst", shift: null }],
  records: [{ employeeId: "employee-1", date: parseIST("2026-02-02 00:00:00")!, status: "present", lateMinutes: 0, overtimeMinutes: 0, punchInTime: parseIST("2026-02-02 09:00:00"), punchOutTime: parseIST("2026-02-02 18:00:00"), punches: [], shift: null }],
  punchesByDay: new Map(),
  leaves: new Set(["employee-1|2026-02-03"]),
  leaveLabels: new Map([["employee-1", ["Casual Leave"]]]),
  holidays: new Set(["2026-02-04"]),
});
const block = matrix.blocks[0];
assert.equal(block.days.length, 28, "matrix includes every calendar day");
assert.equal(block.appliedLeave, "Casual Leave");
assert.equal(block.days[0].status, "WO", "Sunday is a week off without a punch");
assert.equal(block.days[1].status, "P");
assert.equal(block.days[2].status, "L");
assert.equal(block.days[3].status, "H");
assert.deepEqual(block.totals, { present: 1, absent: 21, leave: 1, holiday: 1, weekOff: 4, pon: 0 });
assert.equal(block.days[1].inTime, "09:00");
assert.equal(block.days[1].outTime, "18:00");
assert.equal(block.days[0].inTime, "", "no punch stays blank");

const punchRoute = readFileSync(new URL("../app/api/reports/punch-details/route.ts", import.meta.url), "utf8");
assert.match(punchRoute, /In Device Serial Number/, "punch XLSX includes the device serial column");
assert.match(punchRoute, /date: \{ gte: start, lt: end \}/, "punch query uses the inclusive end-day range");
console.log("monthly report date range tests passed");
