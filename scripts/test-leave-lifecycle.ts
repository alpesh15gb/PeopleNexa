import assert from "node:assert/strict";
import { canReviewLeaveRequest, canWithdrawLeaveRequest } from "../lib/leave-lifecycle";

const self = { status: "pending", employeeId: "employee", createdBy: "employee" };
assert.equal(canWithdrawLeaveRequest(self, "employee"), true, "employee can withdraw own pending request");
assert.equal(canWithdrawLeaveRequest({ ...self, status: "approved" }, "employee"), false, "approved leave is preserved");
assert.equal(canWithdrawLeaveRequest({ ...self, createdBy: "manager" }, "manager"), true, "delegated creator can withdraw their pending request");
assert.equal(canReviewLeaveRequest({ employeeId: "employee", createdBy: "manager" }, "employee"), false, "employee cannot self-approve");
assert.equal(canReviewLeaveRequest({ employeeId: "employee", createdBy: "manager" }, "manager"), false, "delegated creator cannot approve");
assert.equal(canReviewLeaveRequest({ employeeId: "employee", createdBy: "manager" }, "reviewer"), true, "independent reviewer may approve");
console.log("leave lifecycle tests passed");
