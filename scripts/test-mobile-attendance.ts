import assert from "node:assert/strict";
import { encode } from "jpeg-js";
import { readFileSync } from "node:fs";
import { mobileLocation, mobileSelfieBytes, mobileHoldReason, mobileCaptureTime } from "../lib/mobile-attendance";
import { nearestReportSource } from "../lib/punch-report-source";
import { pairPunches } from "../lib/reconcile";
import { dailyPresentEmployeeCounts } from "../lib/attendance-presence";
import { dutyTrackingActive } from "../lib/journey";

assert.deepEqual(mobileLocation({ lat: 0, lng: 0, accuracy: 5 }), { lat: 0, lng: 0, accuracy: 5 });
for (const input of [{ lat: null, lng: null, accuracy: 5 }, { lat: "12", lng: 1, accuracy: 2 }, { lat: 91, lng: 0, accuracy: 5 }, { lat: 0, lng: 181, accuracy: 5 }, { lat: 0, lng: 0, accuracy: -1 }, { lat: 0, lng: 0 }, { lat: false, lng: false, accuracy: 0 }]) assert.throws(() => mobileLocation(input));
const photo = encode({ width: 128, height: 128, data: Buffer.alloc(128 * 128 * 4, 255) }, 70).data;
const dataUrl = `data:image/jpeg;base64,${photo.toString("base64")}`;
const now = Date.parse("2026-10-15T04:00:00Z");
assert.equal(mobileCaptureTime("2026-10-15T03:59:00Z", now).getTime(), now - 60000);
assert.throws(() => mobileCaptureTime("2026-10-15T03:57:00Z", now), /expired/);
assert.throws(() => mobileCaptureTime("2026-10-15T04:01:00Z", now), /expired/);
assert.throws(() => mobileCaptureTime("not-a-date", now, true));
assert.equal(mobileCaptureTime("2026-10-15T03:57:00Z", now, true).getTime(), now - 180000, "retry the original event even after the capture freshness window");
assert.deepEqual(mobileSelfieBytes(dataUrl), photo);
for (const input of [null, "", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,bm90YW5pbWFnZQ==", "data:image/jpeg;base64," + "A".repeat(500000)]) assert.throws(() => mobileSelfieBytes(input));
const small = encode({ width: 10, height: 10, data: Buffer.alloc(10 * 10 * 4, 255) }, 70).data;
assert.throws(() => mobileSelfieBytes(`data:image/jpeg;base64,${small.toString("base64")}`), /small/);
const policy = { faceEnabled: true, enrolled: true, faceStatus: "matched", locationStatus: "inside" };
assert.equal(mobileHoldReason(policy), null);
assert.equal(mobileHoldReason({ ...policy, faceStatus: "review" }), "face_review");
assert.equal(mobileHoldReason({ ...policy, faceStatus: "none" }), "face_review");
assert.equal(mobileHoldReason({ ...policy, faceStatus: "rejected" }), "face_mismatch");
assert.equal(mobileHoldReason({ ...policy, enrolled: false }), "no_enrollment");
assert.equal(mobileHoldReason({ ...policy, locationStatus: "outside" }), "location_mismatch");
assert.equal(mobileHoldReason({ ...policy, locationStatus: "low_accuracy" }), "location_accuracy");
assert.equal(mobileHoldReason({ ...policy, locationStatus: "not_configured" }), "location_not_configured");
assert.equal(mobileHoldReason({ ...policy, faceEnabled: false, faceStatus: "none" }), null);
const mobile = { id: "in", deviceId: null, source: "mobile", inOutHint: "in", punchTime: new Date("2026-10-14T16:30:00Z"), device: null, realtimeDevice: null };
const out = { ...mobile, id: "out", inOutHint: "out", punchTime: new Date("2026-10-15T00:30:00Z") };
const device = { ...mobile, source: "device", punchTime: new Date(mobile.punchTime.getTime() + 60000), device: { name: "Gate machine", serialNumber: "sn-1" } };
assert.deepEqual(nearestReportSource([device, mobile], mobile.punchTime), { name: "Mobile app", serialNumber: "" });
assert.equal(nearestReportSource([device], mobile.punchTime), null, "do not attribute a mobile punch to a nearby machine");
assert.deepEqual(nearestReportSource([device], device.punchTime), device.device);
assert.equal(nearestReportSource([mobile], null), null);
assert.deepEqual(pairPunches([out, mobile], "first_last", new Map()).map(punch => punch.type), ["in", "out"]);
const presence = dailyPresentEmployeeCounts([], [
  { employeeId: "held", punchTime: mobile.punchTime, authStatus: "pending" },
  { employeeId: "declined", punchTime: mobile.punchTime, authStatus: "declined" },
  { employeeId: "accepted", punchTime: mobile.punchTime, authStatus: "approved" },
]);
assert.equal(presence.get("2026-10-14"), 1);
const dutyWindow = { start: mobile.punchTime, end: new Date("2026-10-15T02:00:00Z") };
const openRecord = { punchInTime: mobile.punchTime, punchOutTime: null };
assert.equal(dutyTrackingActive(openRecord, out.punchTime, dutyWindow), true, "overnight approved session can share location");
assert.equal(dutyTrackingActive(null, out.punchTime, dutyWindow), false, "held IN is not an approved attendance session");
assert.equal(dutyTrackingActive(openRecord, out.punchTime, dutyWindow, true), false, "stop sharing immediately when OUT is pending approval");
assert.equal(dutyTrackingActive({ ...openRecord, punchOutTime: out.punchTime }, out.punchTime, dutyWindow), false);
assert.equal(dutyTrackingActive(openRecord, new Date("2026-10-15T03:00:00Z"), dutyWindow), false);
const reviewRoute = readFileSync("app/api/face/review/route.ts", "utf8");
assert.doesNotMatch(reviewRoute, /prisma\.punch\.delete/);
assert.match(reviewRoute, /punch\.employeeId === session\.sub/);
assert.match(reviewRoute, /assertLeavePayrollOpen/);
console.log("Mobile attendance: GPS validation, JPEG evidence, review policy, source attribution, night pair and authorization checks passed.");
