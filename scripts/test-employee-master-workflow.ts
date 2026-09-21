import assert from "node:assert/strict";
import {
  optionalEmployeeEmail,
  optionalEmployeePosition,
  shouldProvisionEmployeeLogin,
} from "../lib/employee-input";

// The Position select submits its label; the API must retain it independently
// of whether it exists in the current scoped options list.
const selectedPosition = optionalEmployeePosition("  Site Supervisor  ");
assert.equal(selectedPosition, "Site Supervisor");
assert.equal(optionalEmployeePosition("Legacy Designation"), "Legacy Designation");

// A master employee is valid without credentials. A login is provisioned only
// when the caller deliberately supplies both fields.
const noEmail = optionalEmployeeEmail("");
assert.equal(noEmail, null);
assert.equal(shouldProvisionEmployeeLogin(noEmail, "a-valid-password"), false);
assert.equal(
  shouldProvisionEmployeeLogin(optionalEmployeeEmail("staff@example.com"), "a-valid-password"),
  true,
);

console.log("employee master position/no-email workflow tests passed");
