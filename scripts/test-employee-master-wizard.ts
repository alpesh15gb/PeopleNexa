import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adjacentEmployeeMasterWizardStep,
  employeeMasterWizardSteps,
} from "../lib/employee-master-wizard";

assert.deepEqual(
  employeeMasterWizardSteps.map((step) => step.key),
  ["official", "personal", "background", "records"],
);
assert.equal(adjacentEmployeeMasterWizardStep("official", "previous"), undefined);
assert.equal(adjacentEmployeeMasterWizardStep("official", "next"), "personal");
assert.equal(adjacentEmployeeMasterWizardStep("personal", "previous"), "official");
assert.equal(adjacentEmployeeMasterWizardStep("background", "next"), "records");
assert.equal(adjacentEmployeeMasterWizardStep("records", "next"), undefined);

const editorSource = readFileSync(
  join(process.cwd(), "app", "(portal)", "admin", "employee-master", "employee-master-quick-edit.tsx"),
  "utf8",
);
const directEditor = editorSource.slice(editorSource.indexOf("export function EmployeeMasterQuickEdit"));
assert.match(directEditor, /<Editor[\s\S]*?mode="wizard"/);
assert.match(editorSource, /mode="continuation"/);
assert.match(
  editorSource,
  /<SpouseFields\s+key="spouse-details"[\s\S]*?profile=\{profile\}/,
);
assert.match(
  editorSource,
  /value=\{stringValue\(profile\.spouseName\)\}[\s\S]*?onChange=\{\(event\) => onChange\("spouseName", event\.target\.value\)\}/,
);
assert.match(
  editorSource,
  /value=\{stringValue\(profile\.spouseContactNumber\)\}[\s\S]*?onChange=\{\(event\) =>[\s\S]*?onChange\("spouseContactNumber", event\.target\.value\)/,
);

console.log("employee master direct-editor wizard navigation tests passed");
