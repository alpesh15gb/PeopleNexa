import assert from "node:assert/strict";
import { recordApiPaging, recordPageHref, recordPageNumber, recordPageRedirect, recordPagination } from "../lib/document-expense-pagination";

assert.deepEqual(recordPagination(0, 1), { total: 0, page: 1, pageSize: 50, pageCount: 1, offset: 0 });
assert.deepEqual(recordPagination(301, 7), { total: 301, page: 7, pageSize: 50, pageCount: 7, offset: 300 });
assert.deepEqual(recordPagination(201, Number.MAX_SAFE_INTEGER), { total: 201, page: 5, pageSize: 50, pageCount: 5, offset: 200 });
assert.equal(recordPageNumber(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
for (const invalid of [undefined, "", "0", "-1", "2.5", "2a", " 2", "01", "9007199254740992", ["2", "4"]]) {
  assert.equal(recordPageNumber(invalid), null);
}

const docs = "/admin/documents";
assert.equal(recordPageHref(docs, { view: ["open", "current"], page: "7" }, 6), `${docs}?view=open&view=current&page=6`);
assert.equal(recordPageRedirect(docs, { view: "open", page: "7" }, recordPagination(300, 7)), `${docs}?view=open&page=6`);
assert.equal(recordPageRedirect(docs, { page: "bogus" }, recordPagination(301, 1)), docs);
assert.equal(recordPageRedirect(docs, { page: "7" }, recordPagination(301, 7)), null);
assert.equal(recordPageRedirect(docs, {}, recordPagination(0, 1)), null);

assert.deepEqual(recordApiPaging(new URLSearchParams(), 300), { page: 1, pageSize: 300 });
assert.deepEqual(recordApiPaging(new URLSearchParams("page=2&pageSize=200"), 200), { page: 2, pageSize: 200 });
assert.equal(recordApiPaging(new URLSearchParams("page=1&page=2"), 200), null);
assert.equal(recordApiPaging(new URLSearchParams("pageSize=301"), 300), null);
assert.equal(recordApiPaging(new URLSearchParams("pageSize=0"), 300), null);
console.log("Document and expense pagination bounds, filter retention and API validation passed.");
