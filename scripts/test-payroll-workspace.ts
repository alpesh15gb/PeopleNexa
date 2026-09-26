import assert from "node:assert/strict";
import { canTransitionPayrollRun } from "../lib/payroll-runs";

// Workspace controls must follow the server's lifecycle rather than infer payout state from payslips.
assert.equal(canTransitionPayrollRun("draft", "reviewed"), true);
assert.equal(canTransitionPayrollRun("reviewed", "approved"), true);
assert.equal(canTransitionPayrollRun("reviewed", "finalized"), false);
assert.equal(canTransitionPayrollRun("finalized", "paid"), true);
assert.equal(canTransitionPayrollRun("paid", "approved"), false);
console.log("payroll workspace lifecycle checks passed");
