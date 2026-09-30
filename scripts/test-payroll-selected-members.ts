import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const generation = source("../app/api/payroll/generate/route.ts");
const picker = source("../app/api/payroll/employees/route.ts");
const panel = source("../app/(portal)/admin/payroll/payroll-panel.tsx");
const page = source("../app/(portal)/admin/payroll/page.tsx");
const engine = source("../lib/payroll.ts");

// Selected generation is explicit and cannot silently fall back to all staff.
assert.match(generation, /selectionMode === "selected" && !selectedEmployeeIds\.length/);
assert.match(generation, /id: \{ in: selectedEmployeeIds \}/);
assert.match(generation, /invalidEmployeeIds/);
assert.match(generation, /ineligibleEmployeeIds/);
assert.match(generation, /employeeLocationScope\(locationId\)/, "cross-location IDs are rejected by the server query");
assert.match(generation, /joiningDate && employee\.joiningDate >= monthEnd/);
assert.match(generation, /existingRun && existingRun\.status !== "draft"/);
assert.match(generation, /existingRun && selectionMode !== "selected"/);
assert.match(generation, /alreadyIncluded/);
assert.match(generation, /payroll_run\.members_added/);
assert.match(generation, /employeeIds: selectedEmployeeIds/);
assert.match(generation, /selectionMode, selectedEmployeeCount/);
assert.match(engine, /where: \{ id: payrollRunId, status: "draft" \}/, "member creation rechecks and locks the Draft lifecycle state");

// The location-manager scope is applied again to the bounded picker endpoint.
assert.match(picker, /payrollOperationLocationId\(session/);
assert.match(picker, /employeeLocationScope\(scope\.locationId\)/);
assert.match(picker, /take: PAGE_SIZE/);
assert.match(picker, /skip: \(page - 1\) \* PAGE_SIZE/);

assert.match(panel, /All eligible employees/);
assert.match(panel, /Add employees to draft payroll/);
assert.match(panel, /Select all visible eligible/);
assert.match(panel, /Clear selection/);
assert.match(page, /notIncludedCount/);
assert.match(panel, /not included in this monthly payroll/);
console.log("selected payroll membership safety checks passed");
