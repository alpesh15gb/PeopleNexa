import assert from "node:assert/strict";
import { needsEbioAccessCommand } from "../lib/ebio-access-plan";

for (const allowed of [true, false]) {
  assert.equal(needsEbioAccessCommand(undefined, allowed), true);
  assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed, commandStatus: "sent" }, allowed), false);
  assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed: !allowed, commandStatus: "sent" }, allowed), true);
  for (const commandStatus of ["failed", "pending"]) {
    assert.equal(needsEbioAccessCommand({ deviceId: "mnp", allowed, commandStatus }, allowed), true);
  }
}
console.log("eBio command retry and unchanged policy tests passed");
