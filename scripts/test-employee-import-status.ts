import assert from "node:assert/strict";
import { employeeImportStatus, assertEmployeeImportStatusChange } from "../lib/employee-import-status";

assert.equal(employeeImportStatus(" ACTIVE "), "active");
assert.equal(employeeImportStatus("Inactive"), "inactive");
assert.equal(employeeImportStatus("  "), undefined);
assert.equal(employeeImportStatus(undefined), undefined);
assert.throws(() => employeeImportStatus("disabled"), /active or inactive/);
const admin = { sub: "admin", role: "admin" };
const employee = { id: "employee", role: "employee", status: "active" };
assert.doesNotThrow(() => assertEmployeeImportStatusChange(admin, employee, "inactive"));
assert.doesNotThrow(() => assertEmployeeImportStatusChange(admin, { ...employee, status: "inactive" }, undefined));
assert.throws(() => assertEmployeeImportStatusChange({ sub: "employee", role: "employee" }, employee, "inactive"), /own account/);
for (const role of ["admin", "branch_manager", "location_manager"]) {
  assert.throws(() => assertEmployeeImportStatusChange(admin, { ...employee, role }, "inactive"), /privileged account/);
}
console.log("Employee upload status checks passed.");
