import assert from "node:assert/strict";
import { resolveLeavePolicy } from "../lib/leave-policy";

const rules = (annualEntitlement: number | null, unlimitedEntitlement = false) => ({ leaveTypes: [{ name: "Casual Leave", code: "CL", annualEntitlement, unlimitedEntitlement, paid: true, allowsHalfDay: true, requiresApproval: false, carryForward: false, carryForwardLimit: null }] });
const record = (overrides: Partial<{ id: string; locationId: string | null; version: number; active: boolean; effectiveFrom: Date; effectiveTo: Date | null; payload: unknown }> = {}) => ({ id: "tenant-v1", locationId: null, version: 1, active: true, effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, payload: rules(12), ...overrides });

const at = new Date("2026-06-15T00:00:00.000Z");
assert.equal(resolveLeavePolicy([], "loc-1", at, "CL"), null, "no policy retains LeaveType behavior");
assert.equal(resolveLeavePolicy([record({ active: false })], "loc-1", at, "CL"), null, "inactive policies do not apply");
assert.equal(resolveLeavePolicy([record({ effectiveFrom: new Date("2026-07-01T00:00:00.000Z") })], "loc-1", at, "CL"), null, "future policies do not apply");
assert.equal(resolveLeavePolicy([record({ effectiveTo: new Date("2026-06-14T23:59:59.999Z") })], "loc-1", at, "CL"), null, "expired policies do not apply");
assert.equal(resolveLeavePolicy([record({ payload: { leaveTypes: [] } })], "loc-1", at, "CL"), null, "invalid policies fall back");

const resolved = resolveLeavePolicy([
  record(),
  record({ id: "location-v2", locationId: "loc-1", version: 2, effectiveFrom: new Date("2026-06-01T00:00:00.000Z"), payload: rules(8) }),
], "loc-1", at, "cl");
assert.deepEqual(resolved, { configurationId: "location-v2", version: 2, scope: "location", rules: { name: "Casual Leave", code: "CL", annualEntitlement: 8, unlimitedEntitlement: false, paid: true, allowsHalfDay: true, requiresApproval: false, carryForward: false, carryForwardLimit: null } }, "location policy overrides tenant policy");

assert.equal(resolveLeavePolicy([record()], "loc-1", at, "SL"), null, "an unmatched policy type retains legacy LeaveType behavior");
const unlimited = resolveLeavePolicy([record({ payload: rules(null) })], "loc-1", at, "CL");
assert.equal(unlimited?.rules.unlimitedEntitlement, false, "a blank policy entitlement removes the annual cap but is not unlimited");
assert.equal(resolveLeavePolicy([record({ payload: rules(null, true) })], "loc-1", at, "CL")?.rules.unlimitedEntitlement, true, "explicit policy setting grants unlimited entitlement");
console.log("leave policy resolution tests passed");
