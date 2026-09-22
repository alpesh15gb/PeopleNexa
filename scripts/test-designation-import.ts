import assert from "node:assert/strict";
import { normalizeDesignationName } from "../lib/designation";

// Import values are normalized before the employee and tenant master writes.
const imported = ["  Site   Supervisor ", "site supervisor", "SITE SUPERVISOR"];
const importedKeys = new Set(imported.map(normalizeDesignationName).filter(Boolean).map((name) => name!.toLocaleLowerCase()));
assert.deepEqual([...importedKeys], ["site supervisor"]);
assert.equal(normalizeDesignationName(imported[0]), "Site Supervisor");

// Legacy employee values use the identical reconciliation key, without changing
// the original employee.position values during migration.
const legacy = [" Site Supervisor", "site   supervisor ", ""];
const legacyKeys = new Set(legacy.map(normalizeDesignationName).filter(Boolean).map((name) => name!.toLocaleLowerCase()));
assert.deepEqual([...legacyKeys], ["site supervisor"]);
assert.equal(normalizeDesignationName(legacy[2]), null);

console.log("designation import and legacy reconciliation tests passed");
