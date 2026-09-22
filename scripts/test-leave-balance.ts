import assert from "node:assert/strict";
import { calculateLeaveBalance, canClaimLeave, isEarnedLeave, leaveBalanceScope, leaveBalanceSource } from "../lib/leave-balance";

assert.deepEqual(calculateLeaveBalance({ cap: null, opening: 0, credited: 0, used: 0, pending: 0 }), { available: 0, committed: 0 }, "uncapped earned leave starts at zero without an import or credit");
assert.equal(calculateLeaveBalance({ cap: null, opening: 0, credited: 4, used: 1, pending: 0 }).available, 3, "future earned credits are claimable without an annual cap");
assert.equal(calculateLeaveBalance({ cap: null, opening: 7, credited: 0, used: 2, pending: 0 }).available, 5, "imported earned balances remain unchanged apart from usage");
assert.equal(canClaimLeave(calculateLeaveBalance({ cap: null, opening: 0, credited: 0, used: 0, pending: 0 }).available, 1), false, "requests beyond an uncredited earned balance are rejected");
assert.deepEqual(calculateLeaveBalance({ cap: null, opening: 0, credited: 4, used: 99, pending: 1, unlimitedEntitlement: true }), { available: null, committed: 100 }, "only explicit unlimited entitlement is unlimited");
assert.equal(calculateLeaveBalance({ cap: 12, opening: 0, credited: 0, used: 8, pending: 2 }).available, 2, "numeric legacy caps remain enforced");
assert.deepEqual(leaveBalanceScope("location_manager", { locationId: "loc-a" }), { branch: { locationId: "loc-a" } }, "location manager scope is location-only");
assert.equal(leaveBalanceScope("location_manager", { locationId: null }), null, "unassigned location manager has no employee scope");
assert.deepEqual(leaveBalanceScope("admin", null), {}, "admin scope remains tenant-wide after tenant filtering");
assert.equal(leaveBalanceSource(true, true), "policy_period", "policy-period allocation remains the current calculation source when an import baseline exists");
assert.equal(leaveBalanceSource(false, true), "imported_snapshot", "matched imports are distinct from allowance fallback");
assert.equal(leaveBalanceSource(false, false), "leave_type_allowance", "uncapped leave types are not inferred unlimited");
assert.equal(leaveBalanceSource(false, false, true), "unlimited_leave_type", "explicit unlimited entitlement is labeled separately");
assert.equal(isEarnedLeave("EL", "Annual leave"), true, "EL code is recognized as earned leave");
assert.equal(isEarnedLeave("PL", "Earned Leave"), true, "earned leave name is recognized for legacy codes");
console.log("leave balance scope and unlimited tests passed");
