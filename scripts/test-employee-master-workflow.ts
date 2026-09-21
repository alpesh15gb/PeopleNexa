import assert from "node:assert/strict";
import {
  optionalEmployeeEmail,
  optionalEmployeePosition,
  shouldProvisionEmployeeLogin,
} from "../lib/employee-input";
import { optionalDateInput } from "../lib/dates";

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

// Selecting a licence classification without an expiry must submit a null
// date, while existing ISO API values must round-trip safely through edits.
assert.equal(optionalDateInput(""), null);
assert.equal(optionalDateInput(null), null);
assert.equal(optionalDateInput("Invalid Date"), "invalid");
const storedExpiry = optionalDateInput("2030-12-31T00:00:00.000Z");
assert.ok(storedExpiry instanceof Date);
assert.equal(storedExpiry.toISOString(), "2030-12-31T00:00:00.000Z");

console.log("employee master position/licence workflow tests passed");
