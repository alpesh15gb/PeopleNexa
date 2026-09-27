import assert from "node:assert/strict";
import { canTransitionPayrollRun, paymentEvidence } from "../lib/payroll-runs";

// Workspace controls must follow the server's lifecycle rather than infer payout state from payslips.
assert.equal(canTransitionPayrollRun("draft", "reviewed"), true);
assert.equal(canTransitionPayrollRun("reviewed", "approved"), true);
assert.equal(canTransitionPayrollRun("reviewed", "finalized"), false);
assert.equal(canTransitionPayrollRun("finalized", "paid"), true);
assert.equal(canTransitionPayrollRun("paid", "approved"), false);
assert.equal(canTransitionPayrollRun("approved", "cancelled"), true, "only pre-finalization runs may be cancelled");
assert.equal(canTransitionPayrollRun("finalized", "cancelled"), false, "finalized evidence cannot be cancelled");
assert.ok("error" in paymentEvidence({}, 2, 2500), "payment cannot transition without evidence");
const evidence = paymentEvidence({ paymentMethod: "bank", settlementDate: "2026-09-28", paymentReference: "BATCH-91", confirmedCount: 2, confirmedNet: 2500 }, 2, 2500);
assert.ok("value" in evidence, "complete payment evidence is accepted");
assert.ok("error" in paymentEvidence({ paymentMethod: "bank", settlementDate: "2026-09-28", paymentReference: "BATCH-91", confirmedCount: 1, confirmedNet: 2500 }, 2, 2500), "count confirmation must match run");
console.log("payroll workspace lifecycle checks passed");
