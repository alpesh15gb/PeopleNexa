import assert from "node:assert/strict";
import { resolveSalaryRevision } from "../lib/salary-revisions";

const revisions = [
  { id: "old", employeeId: "employee-a", newSalary: 40000, effectiveFrom: new Date("2026-08-01") },
  { id: "new", employeeId: "employee-a", newSalary: 45000, effectiveFrom: new Date("2026-10-01") },
];
assert.equal(resolveSalaryRevision(revisions, "employee-a", "2026-07"), null, "future revisions cannot alter historic drafts");
assert.equal(resolveSalaryRevision(revisions, "employee-a", "2026-09")?.newSalary, 40000, "the effective revision is selected");
assert.equal(resolveSalaryRevision(revisions, "employee-a", "2026-11")?.newSalary, 45000, "later effective revision supersedes prior revision");
assert.equal(resolveSalaryRevision(revisions, "employee-b", "2026-11"), null, "revision is employee scoped");
console.log("salary revision resolution tests passed");
