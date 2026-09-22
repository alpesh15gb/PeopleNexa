import assert from "node:assert/strict";
import { canManageDesignations } from "../lib/designation-access";

assert.equal(canManageDesignations("admin"), true);
assert.equal(canManageDesignations("location_manager"), true);
assert.equal(canManageDesignations("branch_manager"), false);
assert.equal(canManageDesignations("supervisor"), false);
assert.equal(canManageDesignations("employee"), false);

console.log("designation access tests passed");
