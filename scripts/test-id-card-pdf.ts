import assert from "node:assert/strict";
import { renderIdCardPdf } from "@/lib/id-card-pdf";
import { ID_CARD_SIZE } from "@/lib/id-card-content";

async function run() {
const pdf = await renderIdCardPdf({
  employeeNumber: "EMP-001",
  deviceCode: "DEVICE-001",
  firstName: "Ada",
  lastName: "Lovelace",
  position: "Senior Engineer",
  joiningDate: new Date("2020-01-02T00:00:00Z"),
  idCardIssuedAt: new Date("2026-01-02T00:00:00Z"),
  idCardValidUntil: new Date("2028-01-02T00:00:00Z"),
  phone: "1234567890",
  profilePicture: null,
  profile: { bloodGroup: "O+" },
});
const source = pdf.toString("latin1");

assert.ok(pdf.subarray(0, 5).equals(Buffer.from("%PDF-")), "renders a PDF");
assert.equal((source.match(/\/Type \/Page\b/g) ?? []).length, 2, "renders front and back pages");
assert.match(source, new RegExp(`/MediaBox \\[0 0 ${ID_CARD_SIZE.widthPt.toFixed(6)} ${ID_CARD_SIZE.heightPt.toFixed(6)}\\]`), "uses CR80 portrait geometry");
assert.match(source, /\/FontFile2\b/, "embeds the local Inter TTF font");
console.log("ID-card PDF smoke tests passed");
}

run().catch((error) => { throw error; });
