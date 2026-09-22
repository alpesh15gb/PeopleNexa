import assert from "node:assert/strict";
import { mediaAllowedForScope, mediaUrl, parseMediaUrl } from "../lib/tenant-media";
import { idCardTemplate } from "../lib/configuration";
import { safeLogoUrl } from "../lib/branding-url";

const tenantAsset = mediaUrl("tenant-a", null, "123e4567-e89b-12d3-a456-426614174000.png");
const locationAsset = mediaUrl("tenant-a", "location-a", "123e4567-e89b-12d3-a456-426614174001.jpg");

assert.deepEqual(parseMediaUrl(tenantAsset), { tenantId: "tenant-a", locationId: null, filename: "123e4567-e89b-12d3-a456-426614174000.png" });
assert.equal(safeLogoUrl(tenantAsset), tenantAsset, "first-party media is a valid branding URL");
assert.equal(mediaAllowedForScope(tenantAsset, "tenant-a", "location-a"), true, "tenant media can be inherited by locations");
assert.equal(mediaAllowedForScope(locationAsset, "tenant-a", "location-a"), true, "location media remains in its location scope");
assert.equal(mediaAllowedForScope(locationAsset, "tenant-a", "location-b"), false, "a location cannot attach another location's media");
assert.equal(mediaAllowedForScope(locationAsset, "tenant-b", "location-a"), false, "a tenant cannot attach another tenant's media");
assert.equal(safeLogoUrl("/api/media/tenant-a/tenant/not-a-uuid.png"), null, "malformed first-party media is rejected");
assert.deepEqual(idCardTemplate({ frontBackgroundUrl: tenantAsset, backBackgroundUrl: tenantAsset }), { frontBackgroundUrl: tenantAsset, backBackgroundUrl: tenantAsset, frontContentPanel: "preserve" }, "uploaded first-party backgrounds are accepted");
assert.equal(idCardTemplate({ frontBackgroundUrl: tenantAsset }), null, "both ID-card backgrounds are required");
assert.ok(idCardTemplate({ frontBackgroundUrl: "https://cdn.example.com/front.jpg", backBackgroundUrl: "data:image/png;base64,AAAA" }), "legacy HTTPS and data backgrounds remain accepted");
console.log("tenant media URL scope tests passed");
