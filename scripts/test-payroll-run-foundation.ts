import assert from "node:assert/strict";
import { canTransitionPayrollRun } from "../lib/payroll-runs";
import { computePayroll, DEFAULT_PAYROLL_CONFIG, reverseLoanDeductionAllocations } from "../lib/payroll";
import { employeeLocationScope } from "../lib/location-scope";

assert.equal(canTransitionPayrollRun("draft", "paid"), false, "draft cannot be paid directly");
assert.equal(canTransitionPayrollRun("approved", "finalized"), true, "approved must finalize before payment");
assert.equal(canTransitionPayrollRun("finalized", "paid"), true);
assert.equal(canTransitionPayrollRun("paid", "draft"), false, "paid runs are immutable");

const result = computePayroll(
  { ...DEFAULT_PAYROLL_CONFIG, monthlyDivisor: 30, pf: { ...DEFAULT_PAYROLL_CONFIG.pf, enabled: false }, esic: { ...DEFAULT_PAYROLL_CONFIG.esic, enabled: false }, pt: { ...DEFAULT_PAYROLL_CONFIG.pt, enabled: false }, tds: { ...DEFAULT_PAYROLL_CONFIG.tds, enabled: false } },
  { salary: 30000, payMode: "monthly" },
  { presentDays: 29, lateDays: 0, halfDays: 0, absentDays: 1, onLeaveDays: 0, overtimeHours: 0, workingDays: 30, workedHours: 0 },
  0,
  "2026-09"
);
assert.equal(result.divisorUsed, 30, "configured divisor must drive LOP/OT basis");
assert.equal(result.absentDeduction, 1000);
assert.deepEqual(employeeLocationScope("location-a"), { OR: [{ branch: { locationId: "location-a" } }, { branchId: null, locationId: "location-a" }] }, "payroll membership uses branch location with a branchless legacy fallback only");
assert.deepEqual(
  reverseLoanDeductionAllocations([{ id: "loan-1", outstanding: 4500, lastDeductedMonth: "2026-09" }], [{ id: "loan-1", amount: 500 }], "2026-09"),
  [{ id: "loan-1", outstanding: 5000 }],
  "cancelling a draft restores the exact persisted loan allocation"
);
assert.equal(reverseLoanDeductionAllocations([{ id: "loan-1", outstanding: 4000, lastDeductedMonth: "2026-10" }], [{ id: "loan-1", amount: 500 }], "2026-09"), null, "a later deduction prevents an unsafe cancellation reversal");
console.log("payroll run foundation checks passed");
