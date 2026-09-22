import assert from "node:assert/strict";
import { deviceAccessPayload } from "../lib/device-access-policy";

assert.deepEqual(
  deviceAccessPayload("all", ["device-a"], ["device-a", "device-b"]),
  { mode: "all", deviceIds: ["device-a", "device-b"] },
);
assert.deepEqual(
  deviceAccessPayload("restricted", ["device-b"], ["device-a", "device-b"]),
  { mode: "restricted", deviceIds: ["device-b"] },
);
assert.throws(
  () => deviceAccessPayload("restricted", [], ["device-a"]),
  /Select at least one active device/,
);

console.log("device access policy tests passed");
