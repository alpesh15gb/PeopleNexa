import assert from "node:assert/strict";
import { payrollFieldMappings } from "../lib/payroll-field-mapping";

assert.equal(payrollFieldMappings.length, 24, "every promised legacy register column is mapped");
assert.deepEqual(new Set(payrollFieldMappings.map((field) => field.group)), new Set(["Employee Details", "Attendance", "Earnings", "Deductions", "Result"]), "mappings retain the five payroll register groups");
assert.equal(payrollFieldMappings.find((field) => field.column === "Hold Salary")?.availability, "hold", "Hold Salary remains explicitly unavailable without a controlled hold/release workflow");
assert.equal(payrollFieldMappings.find((field) => field.column === "Group Health Insurance")?.availability, "health", "health insurance resolves through salary components rather than an implied deduction");
assert.ok(payrollFieldMappings.every((field) => field.actionHref.startsWith("/admin/") && field.actionLabel), "every mapping exposes a real admin deep link");
assert.match(payrollFieldMappings.find((field) => field.column === "Group Health Insurance")?.actionHref ?? "", /section=components/, "component mappings open the new salary-component section");
assert.match(payrollFieldMappings.find((field) => field.column === "PF")?.actionHref ?? "", /section=statutory/, "statutory mappings open the new statutory section");
console.log("payroll field mapping tests passed");
