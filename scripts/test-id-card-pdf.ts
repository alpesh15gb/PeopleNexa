import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { renderIdCardPdf } from "@/lib/id-card-pdf";
import { ID_CARD_SIZE } from "@/lib/id-card-content";

function objectStream(pdf: Buffer, id: number) {
  const objectStart = pdf.indexOf(Buffer.from(`${id} 0 obj\n`));
  assert.notEqual(objectStart, -1, `PDF contains object ${id}`);
  const streamStart = pdf.indexOf(Buffer.from("stream\n"), objectStart) + "stream\n".length;
  const streamEnd = pdf.indexOf(Buffer.from("\nendstream"), streamStart);
  assert.ok(streamStart > objectStart && streamEnd > streamStart, `PDF object ${id} has a stream`);
  return inflateSync(pdf.subarray(streamStart, streamEnd)).toString("latin1");
}

function indirectObject(source: string, id: string) {
  const object = new RegExp(`${id} 0 obj\\r?\\n([\\s\\S]*?)endobj`).exec(source)?.[1];
  assert.ok(object, `PDF contains object ${id}`);
  return object;
}

function pageArtworkBounds(pdf: Buffer, source: string, page: string) {
  const contents = /\/Contents (\d+) 0 R/.exec(page)?.[1];
  const resources = /\/Resources (\d+) 0 R/.exec(page)?.[1];
  assert.ok(resources, "page has a resources object");
  const imageName = /\/XObject <<\s*\/(I\d+) \d+ 0 R/.exec(indirectObject(source, resources))?.[1];
  assert.ok(contents && imageName, "page has an artwork content stream and image resource");
  const stream = objectStream(pdf, Number(contents));
  const match = new RegExp(`q\\s+([\\d.]+) 0 0 (-?[\\d.]+) ([\\d.-]+) ([\\d.-]+) cm\\s+/${imageName} Do`).exec(stream);
  assert.ok(match, "page stream places its artwork with an affine transform");
  const [, imageWidth, imageHeight, x, bottom] = match.map(Number);
  return { left: x, top: ID_CARD_SIZE.heightPt - bottom, right: x + imageWidth, bottom: ID_CARD_SIZE.heightPt - (bottom + imageHeight) };
}

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
const pages = [...source.matchAll(/\/Type \/Page\b/g)].map((match) => source.slice(source.lastIndexOf("<<", match.index), source.indexOf("endobj", match.index)));

assert.ok(pdf.subarray(0, 5).equals(Buffer.from("%PDF-")), "renders a PDF");
assert.equal(pages.length, 2, "renders front and back pages");
for (const page of pages) {
  assert.match(page, new RegExp(`/MediaBox \\[0 0 ${ID_CARD_SIZE.widthPt.toFixed(6)} ${ID_CARD_SIZE.heightPt.toFixed(6)}\\]`), "uses the exact CR80 MediaBox");
  assert.doesNotMatch(page, /\/CropBox\b/, "does not apply a CropBox that could clip the card");
}
for (const [index, page] of pages.entries()) {
  const bounds = pageArtworkBounds(pdf, source, page);
  const epsilon = 0.000001;
  assert.ok(bounds.left >= -epsilon && bounds.top >= -epsilon, `page ${index + 1} artwork does not exceed the top or left page boundary`);
  assert.ok(bounds.right <= ID_CARD_SIZE.widthPt + epsilon && bounds.bottom <= ID_CARD_SIZE.heightPt + epsilon, `page ${index + 1} artwork does not exceed the bottom or right page boundary`);
  assert.ok(Math.abs(bounds.top) <= epsilon && Math.abs(bounds.bottom - ID_CARD_SIZE.heightPt) <= epsilon, `page ${index + 1} artwork reaches both vertical CR80 boundaries without cropping`);
}
assert.match(source, /\/FontFile2\b/, "embeds the local Inter TTF font");
console.log("ID-card PDF smoke tests passed");
}

run().catch((error) => { throw error; });
