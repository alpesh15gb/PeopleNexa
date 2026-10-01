import assert from "node:assert/strict";
import { canDeleteLeaveType, hasExplicitPaidValue } from "../lib/leave-type";

assert.equal(hasExplicitPaidValue(true), true, "paid leave is explicit");
assert.equal(hasExplicitPaidValue(false), true, "unpaid leave is explicit");
assert.equal(hasExplicitPaidValue(null), false, "legacy null is not accepted for new leave types");
assert.equal(hasExplicitPaidValue(undefined), false, "omitted paid treatment is rejected for new leave types");
assert.equal(canDeleteLeaveType([0, 0, 0, 0]), true, "an unused leave type may be deleted");
assert.equal(canDeleteLeaveType([1, 0, 0, 0]), false, "leave request history blocks deletion");
assert.equal(canDeleteLeaveType([0, 1, 0, 0]), false, "policy allocations block deletion");
assert.equal(canDeleteLeaveType([0, 0, 1, 0]), false, "import batches block deletion");
assert.equal(canDeleteLeaveType([0, 0, 0, 1]), false, "import entries block deletion");
console.log("leave type safeguards passed");
