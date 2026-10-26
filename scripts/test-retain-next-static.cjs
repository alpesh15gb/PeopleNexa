const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), assert = require("node:assert/strict");
const { retainNextStatic } = require("./retain-next-static.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "peoplenexa-static-test-"));
try {
  const from = path.join(root, "previous"), to = path.join(root, "current");
  fs.mkdirSync(path.join(from, "chunks"), { recursive: true }); fs.mkdirSync(path.join(to, "chunks"), { recursive: true });
  fs.writeFileSync(path.join(from, "chunks", "old-hash.js"), "old-public-chunk");
  fs.writeFileSync(path.join(from, "chunks", "shared.js"), "old-content");
  fs.writeFileSync(path.join(to, "chunks", "shared.js"), "new-content");
  assert.deepEqual(retainNextStatic(from, to), { copied: 1, retainedCurrent: 1, skippedLinks: 0 });
  assert.equal(fs.readFileSync(path.join(to, "chunks", "shared.js"), "utf8"), "new-content");
  assert.equal(fs.readFileSync(path.join(to, "chunks", "old-hash.js"), "utf8"), "old-public-chunk");
  assert.equal(retainNextStatic(from, to).copied, 0);
  assert.throws(() => retainNextStatic(from, path.join(from, "nested")), /separate/);
  console.log("PASS retained public chunks do not overwrite the current build and copying is idempotent");
} finally {
  const resolved = path.resolve(root), parent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith("peoplenexa-static-test-"));
  fs.rmSync(resolved, { recursive: true });
}
