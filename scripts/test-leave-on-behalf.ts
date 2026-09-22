import assert from "node:assert/strict";
import { canApplyLeaveOnBehalf, leaveSubmissionAttribution } from "../lib/leave-on-behalf";
import { resolveLeavePolicy } from "../lib/leave-policy";

const actor = { branchId: "branch-a", locationId: "location-a" };
assert.equal(canApplyLeaveOnBehalf("admin", actor, { branchId: "branch-b", locationId: "location-b" }), true, "tenant admins can apply across their tenant");
assert.equal(canApplyLeaveOnBehalf("location_manager", actor, { branchId: "branch-b", locationId: "location-a" }), true, "location managers can apply inside their location");
assert.equal(canApplyLeaveOnBehalf("location_manager", actor, { branchId: "branch-b", locationId: "location-b" }), false, "location managers cannot apply outside their location");
assert.equal(canApplyLeaveOnBehalf("employee", actor, { branchId: "branch-a", locationId: "location-a" }), false, "employees cannot apply on behalf of others");

const policy = resolveLeavePolicy([{
  id: "location-policy", locationId: "location-a", version: 1, active: true,
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null,
  payload: { leaveTypes: [{ name: "Casual Leave", code: "CL", annualEntitlement: 8, paid: true, allowsHalfDay: true, requiresApproval: true, carryForward: false, carryForwardLimit: null }] },
}], "location-a", new Date("2026-06-01T00:00:00.000Z"), "CL");
assert.equal(policy?.rules.requiresApproval, true, "delegated requests retain the employee location's approval policy");
assert.equal(policy?.rules.allowsHalfDay, true, "half-day validation comes from the resolved policy");

const attribution = { employeeId: "employee-1", ...leaveSubmissionAttribution("admin-1", "employee-1") };
assert.notEqual(attribution.employeeId, attribution.createdBy, "the employee remains the request subject");
assert.equal(attribution.source, "admin_on_behalf", "delegated submissions retain their source");
assert.deepEqual(leaveSubmissionAttribution("employee-1", "employee-1"), { createdBy: "employee-1", source: "self_service", onBehalf: false }, "self-service submissions retain their own source");
console.log("leave on-behalf authorization, policy, and attribution tests passed");
