import assert from "node:assert/strict";
import { comparePayrollRuns, isFinancialHistoryRun } from "../lib/payroll-reporting";
import { personalPayslipStatus, personalPayslipWhere } from "../lib/personal-payslips";
import { documentSnapshotForResponse } from "../lib/payslip-document";

assert.equal(isFinancialHistoryRun("finalized"), true);
assert.equal(isFinancialHistoryRun("paid"), true);
assert.equal(isFinancialHistoryRun("draft"), false, "draft data is not financial history");
assert.equal(isFinancialHistoryRun("approved"), false, "approved data is not financial history");
const personal = personalPayslipWhere("tenant", "employee");
assert.equal(personal.employeeId, "employee");
assert.equal(personal.tenantId, "tenant");
assert.deepEqual(personal.status, { in: ["finalized", "paid"] });
assert.equal(personalPayslipStatus("paid", "reversed"), "reversed");
assert.match(JSON.stringify(personal.OR), /"reversed"/);
assert.doesNotMatch(JSON.stringify(personalPayslipWhere("tenant", "employee", false).OR), /"reversed"/);
assert.equal(documentSnapshotForResponse({}), null, "incomplete snapshots use recorded historic totals");

const variance = comparePayrollRuns(
  [{ employeeId: "in-scope", grossEarnings: 100, deductions: 10, netSalary: 90 }],
  [{ employeeId: "in-scope", grossEarnings: 120, deductions: 15, netSalary: 105 }, { employeeId: "new", grossEarnings: 50, deductions: 0, netSalary: 50 }],
);
assert.deepEqual(variance.totals, { grossDelta: 70, deductionsDelta: 5, netDelta: 65 });
assert.equal(variance.rows.find((row) => row.employeeId === "in-scope")?.netDelta, 15, "only matching scoped employee slips are compared");
assert.equal(variance.rows.find((row) => row.employeeId === "new")?.netDelta, 50, "new employees are explicitly represented");
console.log("payroll reporting scope checks passed");
