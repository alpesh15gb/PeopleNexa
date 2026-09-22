import assert from "node:assert/strict";
import { calculateLeaveBalance, isEarnedLeave, leaveBalanceScope, leaveBalanceSource } from "../lib/leave-balance";

assert.deepEqual(calculateLeaveBalance({ cap: null, opening: 0, credited: 4, used: 99, pending: 1 }), { available: null, committed: 100 }, "unlimited accrued leave is never capped");
assert.equal(calculateLeaveBalance({ cap: 12, opening: 0, credited: 0, used: 8, pending: 2 }).available, 2, "numeric legacy caps remain enforced");
assert.deepEqual(leaveBalanceScope("location_manager", { locationId: "loc-a" }), { branch: { locationId: "loc-a" } }, "location manager scope is location-only");
assert.equal(leaveBalanceScope("location_manager", { locationId: null }), null, "unassigned location manager has no employee scope");
assert.deepEqual(leaveBalanceScope("admin", null), {}, "admin scope remains tenant-wide after tenant filtering");
assert.equal(leaveBalanceSource(true, true, 10), "policy_period", "policy-period allocation remains the current calculation source when an import baseline exists");
assert.equal(leaveBalanceSource(false, true, 10), "imported_snapshot", "matched imports are distinct from allowance fallback");
assert.equal(leaveBalanceSource(false, false, 10), "leave_type_allowance", "fixed leave-type cap is explicit fallback");
assert.equal(isEarnedLeave("EL", "Annual leave"), true, "EL code is recognized as earned leave");
assert.equal(isEarnedLeave("PL", "Earned Leave"), true, "earned leave name is recognized for legacy codes");
console.log("leave balance scope and unlimited tests passed");
