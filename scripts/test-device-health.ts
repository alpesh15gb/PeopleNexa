import assert from "node:assert/strict";
import { DEVICE_STALE_MS, deviceHealthState, ebioHeartbeatPatch } from "../lib/device-health";

const now = Date.parse("2026-09-25T12:00:00.000Z");
const recent = new Date(now - 5 * 60 * 1000);
const stale = new Date(now - DEVICE_STALE_MS - 1);

// A persisted offline connection state must not override a recent heartbeat.
assert.equal(deviceHealthState("offline", recent, now), "online");
assert.deepEqual(ebioHeartbeatPatch(recent, now), { lastSeenAt: recent, status: "active" });

assert.equal(deviceHealthState("active", stale, now), "stale");
assert.deepEqual(ebioHeartbeatPatch(stale, now), { lastSeenAt: stale });

// SOAP failures/unparseable responses produce no heartbeat patch or reactivation.
assert.equal(ebioHeartbeatPatch(null, now), null);
assert.equal(deviceHealthState("inactive", recent, now), "disabled");
assert.equal(deviceHealthState("maintenance", recent, now), "disabled");

console.log("device health tests passed");
