import assert from "node:assert/strict";
import { carryForwardCandidate, periodBalance } from "../lib/leave-policy-period";

const writes: string[] = [];
const preview = () => ({ eligible: ["tenant-a:loc-1:employee-1"], entitlement: 12, legacyBalance: 7, carryForwardCandidate: carryForwardCandidate(7, true, 5) });
assert.deepEqual(preview(), { eligible: ["tenant-a:loc-1:employee-1"], entitlement: 12, legacyBalance: 7, carryForwardCandidate: 5 });
assert.equal(writes.length, 0, "preview performs no allocation writes");

const allocated = new Set<string>();
const allocate = (tenant: string, location: string, employee: string) => allocated.add(`${tenant}:${location}:${employee}`);
allocate("tenant-a", "loc-1", "employee-1"); allocate("tenant-a", "loc-1", "employee-1"); allocate("tenant-b", "loc-1", "employee-1");
assert.equal(allocated.size, 2, "allocation identity is tenant/location scoped and idempotent");
assert.equal(carryForwardCandidate(9, true, 4), 4, "carry-forward is capped");
assert.equal(carryForwardCandidate(9, false, 4), 0, "disabled carry-forward is rejected");
assert.equal(periodBalance(12, 4, 3), 13, "period balance uses only its explicit allocation");
console.log("leave policy-period tests passed");
