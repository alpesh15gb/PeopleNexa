import assert from "node:assert/strict";
import { parseIST } from "../lib/ist";
import { istDateKey } from "../lib/ist";

const month = "2026-02";
const start = parseIST(`${month}-01 00:00:00`)!;
const days = new Date(Date.UTC(2026, 2, 0)).getDate();
const keys = Array.from({ length: days }, (_, n) => istDateKey(new Date(start.getTime() + n * 86400000)));
assert.equal(keys.length, 28);
assert.equal(keys[0], "2026-02-01");
assert.equal(keys.at(-1), "2026-02-28");
console.log("monthly report date range tests passed");
