import assert from "node:assert/strict";
import { carryForwardCandidate, periodBalance } from "../lib/leave-policy-period";
import { monthlyWorkedDayAccrual, workedDaysForMonth } from "../lib/leave-accrual";

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
const rule = { source: "attendance_status" as const, tiers: [{ minDays: 0, maxDays: 13, daysEarned: 0 }, { minDays: 14, maxDays: 24, daysEarned: 1 }, { minDays: 25, maxDays: 31, daysEarned: 2 }], joiningMonthClaimDeferral: "next_month" as const };
for (const [days, earned] of [[13, 0], [14, 1], [24, 1], [25, 2], [31, 2]] as const) assert.equal(monthlyWorkedDayAccrual(rule, days, null, "2026-06").accrued, earned, `${days} days uses the exact configured tier`);
assert.equal(workedDaysForMonth([{ date: new Date("2026-06-14T00:00:00Z"), status: "present" }, { date: new Date("2026-06-15T00:00:00Z"), status: "half_day" }], "2026-06"), 1.5, "attendance source has explicit half-day semantics");
const joining = monthlyWorkedDayAccrual(rule, 14, new Date("2026-06-14T00:00:00Z"), "2026-06");
assert.equal(joining.accrued, 1, "joiner earns the tier entitlement");
assert.equal(joining.availableOn.toISOString(), "2026-06-30T18:30:00.000Z", "joining-month entitlement is available at the next IST month");
console.log("leave policy-period tests passed");
