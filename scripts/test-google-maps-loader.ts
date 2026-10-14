import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["app/(portal)/admin/branches/branches-manager.tsx", "app/(portal)/admin/regularization/regularization-panel.tsx", "app/(portal)/admin/journeys/route-map.tsx"]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /useGoogleMapsLoader\(\)/, `${file} must use the shared singleton options`);
  assert.doesNotMatch(source, /useJsApiLoader|peoplenexa-branch-geofence|peoplenexa-face-review/, "page navigation must not create a second loader configuration");
}
const shared = readFileSync("components/maps/google-maps.tsx", "utf8");
assert.match(shared, /useJsApiLoader\(GOOGLE_MAPS_LOADER_OPTIONS\)/);
assert.match(shared, /id: "peoplenexa-google-maps"/);
console.log("All map screens share one Google loader configuration.");
