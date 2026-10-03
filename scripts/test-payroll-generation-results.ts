import assert from "node:assert/strict";
import { payrollGenerationReason, payrollGenerationTotals, type PayrollGenerationResult } from "../lib/payroll-generation-results";

const results: PayrollGenerationResult[] = [
  { employeeId: "ok", employeeName: "Created", created: true, netSalary: 10000 },
  { employeeId: "failed", employeeName: "Failed", created: false, error: "Loan balances changed during generation. Retry this employee." },
  { employeeId: "future", employeeName: "Future joiner", created: false, skipped: "not-joined" },
  { employeeId: "salary", employeeName: "Missing salary", created: false, skipped: "missing-salary" },
  { employeeId: "duplicate", employeeName: "Existing", created: false, skipped: "already-included" },
];
assert.deepEqual(payrollGenerationTotals(results), { created: 1, failed: 1, skipped: 3, total: 5 });
assert.equal(payrollGenerationReason(results[1]), results[1].error, "employee failure remains actionable instead of being replaced by the empty-run message");
assert.match(payrollGenerationReason(results[2]), /joining date/i);
assert.match(payrollGenerationReason(results[3]), /salary/i);
assert.match(payrollGenerationReason(results[4]), /already exists/i);
assert.deepEqual(payrollGenerationTotals([results[2]]), { created: 0, failed: 0, skipped: 1, total: 1 }, "an all-skipped run must account for every employee");
assert.deepEqual(payrollGenerationTotals([]), { created: 0, failed: 0, skipped: 0, total: 0 });
assert.match(payrollGenerationReason({ employeeId: "unknown", employeeName: "Unknown", created: false }), /Check the payroll run/);
console.log("Payroll generation failure and skip reporting checks passed.");
