import assert from "node:assert/strict";
import {
  policySavePlan,
  policyTimeline,
  samePolicy,
  workingPolicy,
  type PolicyWorkspaceRecord,
} from "../lib/policy-workspace";
import { resolveConfiguration } from "../lib/configuration";

const input = {
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  payload: { amount: 100, nested: { a: 1, b: 2 } },
};
const records: PolicyWorkspaceRecord[] = [];
function save(
  payload: unknown,
  apply = false,
  effectiveFrom = input.effectiveFrom,
) {
  const value = { ...input, payload, effectiveFrom };
  const plan = policySavePlan(records, value, apply);
  if (plan.unchanged) return plan.unchanged;
  let record = plan.working;
  if (record) Object.assign(record, value);
  else {
    record = {
      id: `record-${plan.nextVersion}`,
      version: plan.nextVersion,
      active: false,
      activatedAt: null,
      ...value,
    };
    records.push(record);
  }
  if (apply) {
    const timeline = policyTimeline(records, record.id, effectiveFrom, null);
    for (const change of timeline.changes)
      Object.assign(
        records.find((item) => item.id === change.id)!,
        change,
      );
    Object.assign(record, {
      active: true,
      activatedAt: new Date(),
      effectiveTo: timeline.effectiveTo,
    });
  }
  return record;
}
const first = save(input.payload);
assert.equal(
  save({ amount: 200 }).id,
  first.id,
  "editing updates the existing working copy",
);
assert.equal(
  save({ amount: 200 }).id,
  first.id,
  "repeat save reuses the working copy",
);
assert.equal(records.length, 1);
save({ amount: 200 }, true);
save({ amount: 200 }, true);
save({ amount: 200 });
assert.equal(
  records.length,
  1,
  "unchanged applied settings never create another version",
);
save({ amount: 300 }, false, new Date("2026-11-01"));
save({ amount: 400 }, false, new Date("2026-11-01"));
assert.equal(
  records.length,
  2,
  "the next meaningful change has only one working copy",
);
save({ amount: 400 }, true, new Date("2026-11-01"));
assert.equal(
  records[0].active,
  true,
  "an earlier policy stays available for earlier months",
);
assert.equal(
  new Date(records[0].effectiveTo!).toISOString(),
  "2026-10-31T23:59:59.999Z",
);
const resolverRecords = () =>
  records.map((record) => ({
    ...record,
    locationId: null,
    effectiveFrom: new Date(record.effectiveFrom),
    effectiveTo: record.effectiveTo ? new Date(record.effectiveTo) : null,
  }));
assert.equal(
  resolveConfiguration(resolverRecords(), null, new Date("2026-10-02"))?.id,
  first.id,
);
assert.equal(
  resolveConfiguration(resolverRecords(), null, new Date("2026-11-02"))?.id,
  "record-2",
);
save({ amount: 250 }, true, new Date("2026-05-01"));
assert.equal(
  new Date(records[2].effectiveTo!).toISOString(),
  "2026-10-31T23:59:59.999Z",
  "a change before a scheduled policy stops before that policy",
);
save({ amount: 250 }, true, new Date("2026-05-01"));
assert.equal(
  records.length,
  3,
  "repeat apply is idempotent even with an automatically clipped end date",
);
save({ amount: 260 }, true, new Date("2026-05-01"));
assert.equal(
  records[2].active,
  false,
  "same-date replacement is historical, not a reusable draft",
);
assert.equal(workingPolicy(records), null);
assert.ok(
  samePolicy(
    { ...first, ...input },
    {
      ...input,
      payload: { nested: { b: 2, a: 1 }, amount: 100, unset: undefined },
    },
  ),
  "object ordering and omitted optional fields do not create versions",
);
assert.ok(
  !samePolicy(
    { ...first, ...input },
    { ...input, payload: { ...input.payload, amount: 101 } },
  ),
);
const historical: PolicyWorkspaceRecord = {
  ...first,
  id: "archived",
  version: 50,
  active: false,
  activatedAt: new Date(),
};
assert.equal(
  workingPolicy([
    historical,
    { ...first, id: "stale", version: 49, active: false, activatedAt: null },
  ]),
  null,
  "stale legacy drafts are never mistaken for current changes",
);
console.log("policy workspace regression tests passed");
