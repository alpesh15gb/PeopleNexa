import assert from "node:assert/strict";
import { DEVICE_IDLE_MS, DEVICE_STALE_MS, REALTIME_ONLINE_WINDOW_MS, deviceHealthState, deviceStatusMetadata, ebioHeartbeatPatch, realtimeDeviceHealthState } from "../lib/device-health";

const now = Date.parse("2026-09-25T12:00:00.000Z");
const recent = new Date(now - 5 * 60 * 1000);
const stale = new Date(now - DEVICE_STALE_MS - 1);

// A persisted offline connection state must not override a recent heartbeat.
assert.equal(deviceHealthState("offline", recent, now), "online");
assert.deepEqual(ebioHeartbeatPatch(recent, now), { lastSeenAt: recent, status: "active" });

assert.equal(deviceHealthState("active", stale, now), "stale");
assert.equal(deviceHealthState("active", new Date(now - DEVICE_IDLE_MS - 1), now), "idle");
assert.deepEqual(ebioHeartbeatPatch(stale, now), { lastSeenAt: stale });

// SOAP failures/unparseable responses produce no heartbeat patch or reactivation.
assert.equal(ebioHeartbeatPatch(null, now), null);
assert.equal(deviceHealthState("inactive", recent, now), "disabled");
assert.equal(deviceHealthState("inactive", null, now), "disabled");
assert.equal(deviceHealthState("maintenance", recent, now), "disabled");
assert.equal(deviceHealthState("active", null, now), "offline");
assert.equal(deviceHealthState("offline", null, now), "offline");
assert.equal(deviceStatusMetadata("offline", 0), "Offline · 0 logs");
assert.equal(deviceStatusMetadata("offline"), "Offline");

// Realtime availability is only based on its documented poll/webhook window.
assert.equal(realtimeDeviceHealthState("active", new Date(now - REALTIME_ONLINE_WINDOW_MS + 1), now), "online");
assert.equal(realtimeDeviceHealthState("active", new Date(now - REALTIME_ONLINE_WINDOW_MS), now), "offline");
assert.equal(realtimeDeviceHealthState("active", null, now), "offline");
assert.equal(realtimeDeviceHealthState("inactive", recent, now), "disabled");
assert.equal(realtimeDeviceHealthState("inactive", null, now), "disabled");

console.log("device health tests passed");
