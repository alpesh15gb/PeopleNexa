import assert from "node:assert/strict";
import { payrollAttendanceSource } from "../lib/payroll-attendance-workflow";

const app = { version: 2, attendance: { presentDays: 20 } };
const workbook = (uploadId: string) => ({ version: 2, attendance: { presentDays: 20 }, manualAttendance: { uploadId } });

assert.equal(payrollAttendanceSource([]), "unknown");
assert.equal(payrollAttendanceSource([null]), "unknown");
assert.equal(payrollAttendanceSource([{}]), "unknown");
assert.equal(payrollAttendanceSource([app, app]), "automatic");
assert.equal(payrollAttendanceSource([workbook("file-1"), workbook("file-1")]), "manual");
assert.equal(payrollAttendanceSource([workbook("file-1"), app]), "mixed");
assert.equal(payrollAttendanceSource([workbook("file-1"), workbook("file-2")]), "mixed");
assert.equal(payrollAttendanceSource([workbook("file-1"), null]), "unknown", "legacy snapshots must not be mislabelled");
assert.equal(payrollAttendanceSource([{ attendance: {}, manualAttendance: {} }]), "unknown", "an incomplete workbook source must not be labelled automatic");
assert.equal(payrollAttendanceSource([{ attendance: {}, manualAttendance: { uploadId: "  " } }]), "unknown");
console.log("Payroll attendance source classification checks passed.");
