import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { codeKey, ylrAlias, nextPayrollMonth, earnedFromWorkDays, previewPayrollAttendance, reviewAttendanceRows, manualAttendanceSource, payrollAttendanceTemplate, readAttendanceWorkbook, type ImportEmployee } from "../lib/payroll-attendance-import";
import { computePayroll, DEFAULT_PAYROLL_CONFIG } from "../lib/payroll";
import { resolveManualPayrollSource, validateManualPayrollSource } from "../lib/payroll-manual-source";
import { finalizeManualAttendanceCredits } from "../lib/payroll-attendance-credit";
import { refreshEarnedLeaveBalances } from "../lib/leave-accrual-refresh";
import type { Prisma } from "../generated/prisma/client";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { savePayrollWorkbook, readPayrollWorkbook, removePayrollWorkbook } from "../lib/payroll-attendance-storage";

async function main() {
const employee: ImportEmployee = { id: "employee-a", employeeNumber: "YLR0158", firstName: "Test", lastName: "Person", status: "active", joiningDate: null, payMode: "monthly" };
const header = ["Emp Code", "Name of Employee", ...Array.from({ length: 30 }, (_, i) => i + 1), "Work Days", "Leaves - Sep, 26"];
function workbook(extra: unknown[][] = []) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ["YLR/158", "Test Person", ...Array(19).fill("P"), ...Array(9).fill("OD"), "L", "L", 28, 2], ...extra]), "Attendance Sep-2026");
  return book;
}
function previewLegacyAttendance(book: XLSX.WorkBook, sheet: string, month: string, employees: ImportEmployee[]) {
  return previewPayrollAttendance(book, sheet, month, employees, "legacy");
}

const standardMonth = "2028-02";
const standardSheet = `Attendance ${standardMonth}`;
const standardBook = readAttendanceWorkbook(payrollAttendanceTemplate(standardMonth));
assert.deepEqual(standardBook.SheetNames, [standardSheet, "Instructions"]);
const standardEmployee = { ...employee, employeeNumber: "002", joiningDate: new Date("2028-02-03T12:00:00Z") };
XLSX.utils.sheet_add_aoa(standardBook.Sheets[standardSheet], [["002", "Test Person", null, null, "P", "OD", "A", "HL", "PL", "UL", "WO", "H", ...Array(19).fill("P")]], { origin: "A2" });
const [standardRow] = previewPayrollAttendance(standardBook, standardSheet, standardMonth, [standardEmployee]);
assert.equal(standardRow.match, "exact");
assert.equal(standardRow.workDays, 21.5);
assert.equal(standardRow.blankDays, 0, "days before joining are outside payroll");
assert.equal(standardRow.earnedLeave, 0, "standard uploads do not apply client accrual tiers");
assert.deepEqual(standardRow.blockers, []);
assert.deepEqual(standardRow.issues, []);
assert.throws(() => previewPayrollAttendance(standardBook, standardSheet, "2032-02", [standardEmployee]), /Worksheet identifies/);
assert.equal(previewPayrollAttendance(workbook(), "Attendance Sep-2026", "2026-09", [employee])[0].match, "unmatched", "standard preview uses exact numbers only");
const standardReviewed = reviewAttendanceRows([standardRow], [{ rowNumber: 2 }]);
const standardDb = {
  payrollAttendanceImport: { findFirst: async () => ({ reviewedRows: standardReviewed }) },
  employee: { findFirst: async () => ({ joiningDate: standardEmployee.joiningDate }) },
} as unknown as Prisma.TransactionClient;
const standardSource = await resolveManualPayrollSource(standardDb, "tenant-a", "location-a", standardMonth, "standard-upload", employee.id);
assert.deepEqual(standardSource.summary, { presentDays: 21, lateDays: 0, halfDays: 1, absentDays: 1, onLeaveDays: 2, paidLeaveDays: 1, unpaidLeaveDays: 1, overtimeHours: 0, workingDays: 23, workedHours: 0 });
assert.throws(() => validateManualPayrollSource(standardSource, "monthly", false), /unpaid-day deduction/);
assert.throws(() => validateManualPayrollSource(standardSource, "daily", true), /requires monthly pay/);
assert.doesNotThrow(() => validateManualPayrollSource(standardSource, "monthly", true));
await finalizeManualAttendanceCredits(standardDb, { id: "standard-run", tenantId: "tenant-a", locationId: "location-a", month: standardMonth, payslips: [{ employeeId: employee.id, inputSnapshot: { manualAttendance: standardSource } }] });
XLSX.utils.sheet_add_aoa(standardBook.Sheets[standardSheet], [[null, "Missing ID", "P"]], { origin: "A3" });
assert.match(previewPayrollAttendance(standardBook, standardSheet, standardMonth, [standardEmployee])[1].blockers.join(" "), /number is missing/);
XLSX.utils.sheet_add_aoa(standardBook.Sheets[standardSheet], [[1]], { origin: "AF1" });
assert.throws(() => previewPayrollAttendance(standardBook, standardSheet, standardMonth, [standardEmployee]), /day columns/);

assert.equal(ylrAlias("YLR/158"), "YLR0158");
assert.equal(ylrAlias("YLR/002"), "YLR0002");
assert.equal(ylrAlias("YLR0002"), "YLR/002");
assert.equal(ylrAlias("ABC/158"), null);
assert.equal(codeKey(" ylr/158 "), "YLR/158");
assert.equal(nextPayrollMonth("2026-12"), "2027-01");
assert.deepEqual([0, 13, 14, 24, 25, 31].map(earnedFromWorkDays), [0, 0, 1, 1, 2, 2]);
const rows = previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-09", [employee]);
assert.equal(rows[0].match, "alias");
assert.equal(rows[0].workDays, 28);
assert.equal(rows[0].leaveDays, 2);
assert.equal(rows[0].earnedLeave, 2);
assert.equal(rows[0].availableMonth, "2026-10");
assert.deepEqual(rows[0].issues, []);
const reviewed = reviewAttendanceRows(rows, [{ rowNumber: 2 }]);
const previousUploadsDir = process.env.UPLOADS_DIR;
const testUploadsDir = await mkdtemp(path.join(tmpdir(), "peoplenexa-payroll-test-"));
process.env.UPLOADS_DIR = testUploadsDir;
try {
  const original = XLSX.write(workbook(), { type: "buffer", bookType: "xlsx" }) as Buffer;
  const storageKey = await savePayrollWorkbook(original);
  assert.deepEqual(await readPayrollWorkbook(storageKey), original, "preserve the exact original workbook bytes");
  assert.throws(() => readPayrollWorkbook("../outside.xlsx"), /Invalid workbook/);
  await removePayrollWorkbook(storageKey);
  await rmdir(path.join(testUploadsDir, "private-payroll-attendance"));
} finally {
  if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = previousUploadsDir;
  await rmdir(testUploadsDir);
}
const source = manualAttendanceSource("upload-a", reviewed[0]);
assert.equal(source.summary.overtimeHours, 0);
assert.equal(source.summary.workedHours, 0);
assert.equal(source.summary.unpaidLeaveDays, 2);
const config = { ...DEFAULT_PAYROLL_CONFIG, salaryDivisorMethod: "calendar_days" as const, pf: { ...DEFAULT_PAYROLL_CONFIG.pf, enabled: false }, esic: { ...DEFAULT_PAYROLL_CONFIG.esic, enabled: false }, pt: { ...DEFAULT_PAYROLL_CONFIG.pt, enabled: false }, tds: { ...DEFAULT_PAYROLL_CONFIG.tds, enabled: false } };
const pay = computePayroll(config, { salary: 30000, payMode: "monthly" }, source.summary, 0, "2026-09");
assert.equal(pay.netSalary, 28000, "two L days must be unpaid using app salary and calendar-day policy");
const collision = previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-09", [employee, { ...employee, id: "employee-b", employeeNumber: "YLR/158" }]);
assert.equal(collision[0].match, "collision");
assert.throws(() => reviewAttendanceRows(collision, [{ rowNumber: 2, reason: "verified" }]), /different employees/);
const duplicate = previewLegacyAttendance(workbook([["YLR0158", "Test Person", ...Array(30).fill("P"), 30, 2]]), "Attendance Sep-2026", "2026-09", [employee]);
assert(duplicate.every(row => row.blockers.some(issue => issue.includes("Duplicate"))));
assert.throws(() => previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-10", [employee]), /Worksheet identifies/);
assert.throws(() => previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-06", [employee]), /Worksheet identifies/);
const blankBook = workbook(); blankBook.Sheets["Attendance Sep-2026"]["C2"] = { t: "s", v: "" };
const blankRows = previewLegacyAttendance(blankBook, "Attendance Sep-2026", "2026-09", [employee]);
assert.equal(blankRows[0].blankDays, 1);
assert.throws(() => reviewAttendanceRows(blankRows, [{ rowNumber: 2, reason: "checked" }]), /resolve blank/);
assert.throws(() => reviewAttendanceRows(blankRows, [{ rowNumber: 2, blankAsUnpaid: true }]), /reason/);
const blankReviewed = reviewAttendanceRows(blankRows, [{ rowNumber: 2, blankAsUnpaid: true, reason: "Confirmed unpaid" }]);
assert.equal(manualAttendanceSource("upload-a", blankReviewed[0]).summary.absentDays, 1);
const inactive = previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-09", [{ ...employee, status: "inactive" }]);
assert.throws(() => reviewAttendanceRows(inactive, [{ rowNumber: 2 }]), /reason/);
const hourly = previewLegacyAttendance(workbook(), "Attendance Sep-2026", "2026-09", [{ ...employee, payMode: "hourly" }]);
assert(hourly[0].blockers.some(issue => issue.includes("Hourly")));

// Finalization/retries/replacements use the same durable per-month credit.
let saved: Record<string, unknown> | null = null;
const earnedRule = { name: "Earned Leave", code: "EL", annualEntitlement: null, paid: true, allowsHalfDay: true, requiresApproval: true, carryForward: false, carryForwardLimit: null, workedDayAccrual: { source: "attendance_status", tiers: [{ minDays: 0, maxDays: 13, daysEarned: 0 }, { minDays: 14, maxDays: 24, daysEarned: 1 }, { minDays: 25, maxDays: 31, daysEarned: 2 }], joiningMonthClaimDeferral: "none" } };
const db = {
  payrollAttendanceImport: { findFirst: async () => ({ reviewedRows: reviewed.map(({ format: _format, ...historicalRow }) => historicalRow) }) },
  employee: { findFirst: async () => ({ joiningDate: null }) },
  leavePolicyBalance: { findMany: async () => [{ policySnapshot: { rules: earnedRule } }] },
  payrollAttendanceCredit: {
    findUnique: async () => saved,
    upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { saved = saved ? { ...saved, ...update } : create; },
  },
} as unknown as Prisma.TransactionClient;
const run = { id: "run-a", tenantId: "tenant-a", locationId: "location-a", month: "2026-09", payslips: [{ employeeId: employee.id, inputSnapshot: { manualAttendance: source } }] };
await finalizeManualAttendanceCredits(db, run);
await finalizeManualAttendanceCredits(db, run);
assert.equal((saved as unknown as { earnedDays: number }).earnedDays, 2);
assert.equal((saved as unknown as { availableOn: Date }).availableOn.toISOString(), "2026-09-30T18:30:00.000Z");
await assert.rejects(() => finalizeManualAttendanceCredits(db, { ...run, id: "run-b" }), /already credited/);
saved = Object.assign({}, saved, { active: false });
await finalizeManualAttendanceCredits(db, { ...run, id: "run-b" });
assert.equal((saved as unknown as { payrollRunId: string }).payrollRunId, "run-b");
// Manual accrual replaces automatic accrual, stays unavailable in September,
// and becomes exactly two days in October, even for a long-serving employee.
let updatedBalance: { entitlement: number; policySnapshot: unknown } | null = null;
const accrualDb = {
  leavePolicyBalance: {
    findMany: async () => [{ id: "balance-a", employeeId: employee.id, entitlement: 0, policySnapshot: { rules: earnedRule }, employee: { joiningDate: new Date("2025-01-01T00:00:00Z") }, policyPeriod: { effectiveFrom: new Date("2026-09-01T12:00:00Z"), effectiveTo: null } }],
    update: async ({ data }: { data: typeof updatedBalance }) => { updatedBalance = data; },
  },
  attendance: { findMany: async () => [] },
  payrollAttendanceCredit: { findMany: async () => [{ employeeId: employee.id, uploadId: "upload-a", month: "2026-09", workedDays: 28, earnedDays: 2, availableOn: new Date("2026-09-30T18:30:00Z") }] },
  payrollAttendanceImport: { findMany: async () => [{ id: "upload-a", reviewedRows: reviewed }] },
} as unknown as Prisma.TransactionClient;
await refreshEarnedLeaveBalances(accrualDb, "tenant-a", [employee.id], new Date("2026-09-30T12:00:00Z"));
assert.equal((updatedBalance as unknown as { entitlement: number }).entitlement, 0);
await refreshEarnedLeaveBalances(accrualDb, "tenant-a", [employee.id], new Date("2026-10-01T00:00:00Z"));
assert.equal((updatedBalance as unknown as { entitlement: number }).entitlement, 2);

console.log("Payroll manual attendance checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
