import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { canConfirmLeaveBalanceImport, matchLeaveLedgerEmployee, normalizeLeaveLedgerEmployeeCode, parseKeystoneLeaveLedgerSheet, parseLeaveBalanceFlatCsv } from "../lib/leave-balance-import";

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Sheet1");
sheet.getCell("A3").value = "Employee Leave Details For 2026";
["Sl No", "Employee Code", "Name Of Employee", "Designation", "Date Of Joining", "Leave Balance as on 31.12.2025"].forEach((value, index) => sheet.getCell(5, index + 1).value = value);
sheet.getCell("G5").value = "Working Days"; sheet.getCell("H5").value = "Leaves Credited"; sheet.getCell("I5").value = "Leaves Availed"; sheet.getCell("J5").value = "Leave Balance";
sheet.getCell("K5").value = "Working Days"; sheet.getCell("L5").value = "Leaves Credited"; sheet.getCell("M5").value = "Leaves Availed"; sheet.getCell("N5").value = "Leave Balance";
sheet.getCell("A6").value = 1; sheet.getCell("B6").value = "EMP-001"; sheet.getCell("C6").value = "Fixture Employee"; sheet.getCell("D6").value = "Supervisor"; sheet.getCell("E6").value = new Date("2024-01-01"); sheet.getCell("F6").value = 5;
sheet.getCell("G6").value = 25; sheet.getCell("H6").value = 2; sheet.getCell("I6").value = 1; sheet.getCell("J6").value = 6;
sheet.getCell("K6").value = 24; sheet.getCell("L6").value = 1; sheet.getCell("M6").value = 2; sheet.getCell("N6").value = 5;
const parsed = parseKeystoneLeaveLedgerSheet(sheet, "2026-02");
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.rows.length, 1);
assert.deepEqual(parsed.rows[0].errors, []);
assert.equal(parsed.rows[0].openingBalance, 6);
assert.equal(parsed.rows[0].workedDays, 24);
assert.equal(parsed.rows[0].credited, 1);
assert.equal(parsed.rows[0].availed, 2);
assert.equal(parsed.rows[0].available, 5);
sheet.getCell("N6").value = 4;
assert.match(parseKeystoneLeaveLedgerSheet(sheet, "2026-02").rows[0].errors.join(" "), /does not reconcile/);
const csv = [
  "schema_profile,employee_code,employee_name,designation,joining_date,opening_balance,through_month,worked_days,credited,availed,available,source_row",
  "peoplenexa-leave-balance-flat-v1,EMP-001,Fixture Employee,Supervisor,2024-01-01,6,2026-02,24,1,2,5,6",
].join("\n");
const flat = parseLeaveBalanceFlatCsv(csv, "2026-02");
assert.equal(flat.errors.length, 0);
assert.deepEqual(flat.rows[0].errors, []);
assert.match(parseLeaveBalanceFlatCsv(csv.replace(",5,6", ",4,6"), "2026-02").rows[0].errors.join(" "), /must reconcile/);

const activeEmployees = [
  { id: "employee-portal-login", employeeNumber: "EMP-001", deviceCode: null },
  { id: "employee-device-code", employeeNumber: "EMP-002", deviceCode: "MN/004" },
  { id: "employee-canonical-code", employeeNumber: " mn-005 ", deviceCode: "BIO-005" },
];
assert.equal(matchLeaveLedgerEmployee(" emp-001 ", activeEmployees).kind, "matched", "staff with portal login remains eligible");
const deviceMatch = matchLeaveLedgerEmployee(" MN / 004 ", activeEmployees);
assert.equal(deviceMatch.kind, "matched");
if (deviceMatch.kind === "matched") assert.equal(deviceMatch.employee.id, "employee-device-code");
const canonicalMatch = matchLeaveLedgerEmployee("MN-005", activeEmployees);
assert.equal(canonicalMatch.kind, "matched");
if (canonicalMatch.kind === "matched") assert.equal(canonicalMatch.matchedBy, "employeeNumber");
assert.equal(matchLeaveLedgerEmployee("missing", activeEmployees).kind, "unmatched");
assert.equal(matchLeaveLedgerEmployee("MN/004", activeEmployees.filter((employee) => employee.id !== "employee-device-code")).kind, "unmatched", "inactive employees are excluded before matching");
assert.equal(matchLeaveLedgerEmployee("DUP-001", [...activeEmployees, { id: "employee-duplicate", employeeNumber: "DUP-001", deviceCode: null }, { id: "employee-device-duplicate", employeeNumber: "EMP-003", deviceCode: "dup-001" }]).kind, "ambiguous");
assert.equal(normalizeLeaveLedgerEmployeeCode(" MN / 004 "), "mn/004");
assert.equal(canConfirmLeaveBalanceImport({ blocking: true, structuralErrors: 0, readyCount: 1511, excludedCount: 93, reviewedExceptions: false, acknowledgedExceptionCount: 0 }).allowed, false, "strict import blocks every exception");
assert.equal(canConfirmLeaveBalanceImport({ blocking: true, structuralErrors: 0, readyCount: 1511, excludedCount: 93, reviewedExceptions: true, acknowledgedExceptionCount: 92 }).allowed, false, "partial import requires the exact exception acknowledgement");
const reviewed = canConfirmLeaveBalanceImport({ blocking: true, structuralErrors: 0, readyCount: 1511, excludedCount: 93, reviewedExceptions: true, acknowledgedExceptionCount: 93 });
assert.deepEqual(reviewed, { allowed: true, decision: "reviewed_exceptions" }, "explicit reviewed-exceptions import accepts only ready rows");
assert.equal(canConfirmLeaveBalanceImport({ blocking: true, structuralErrors: 1, readyCount: 1511, excludedCount: 93, reviewedExceptions: true, acknowledgedExceptionCount: 93 }).allowed, false, "partial import never bypasses structural workbook errors");
console.log("leave import parser tests passed");
