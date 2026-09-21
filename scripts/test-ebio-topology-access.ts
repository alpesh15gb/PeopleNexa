import assert from "node:assert/strict";
import { ebioLocationCode, topologySyncInstruction } from "../lib/ebio-location";

// DeviceName is the documented UpdateEmployee location, so reject display-name
// guesses and make the recovery route match the caller's authority.
assert.equal(ebioLocationCode({ locationCode: " MNP " }), "MNP");
assert.equal(ebioLocationCode({ locationCode: "MNP, worksite" }), null);
assert.equal(ebioLocationCode({ location: "Mumbai" }), null);
assert.match(topologySyncInstruction("admin"), /^Run Admin > Settings > eBioserver > Sync topology/);
assert.match(topologySyncInstruction("location_manager"), /^A tenant Admin must run Admin > Settings > eBioserver > Sync topology/);

console.log("eBio topology access tests passed");
