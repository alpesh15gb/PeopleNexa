import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configurationEffectiveAtISTDay, payrollPolicyDraft, resolveConfiguration } from "../lib/configuration";
import { parseIST } from "../lib/ist";
import { payrollRunPreflight } from "../lib/payroll-preflight";
import { DEFAULT_PAYROLL_CONFIG } from "../lib/payroll";
import { payrollPolicyEditorBaseline, payrollPolicyEditorDraft, payrollScheduleExample, resolvePayrollPolicyEditorSource } from "../lib/payroll-policy-editor";

const policy = {
  monthlyDivisor: 26, deductLossOfPay: true, overtimeMultiplier: 1.5, overtimeBasis: "basic_hourly" as const,
  statutory: { pfEnabled: false, pfWageCeiling: 0, esicEnabled: false, esicGrossCeiling: 0, professionalTaxEnabled: false, professionalTaxState: "", labourWelfareFundEnabled: false, tdsEnabled: false, tdsRegime: "new" as const },
  schedule: { frequency: "monthly" as const, payDateRule: "last_day" as const, attendanceCutoffDay: null, adjustmentCutoffDay: null, reimbursementCutoffDay: null },
  statutoryRules: [{ jurisdiction: "Example", establishment: "Entity A", ruleVersion: "2026.1", sourceReference: "DOC-001", reviewStatus: "pending_legal_review" as const, effectiveFrom: "2026-01-01", effectiveTo: null }],
  components: [{ code: "BASIC", label: "Basic", kind: "earning" as const, formula: "percent_of_ctc" as const, amount: 50, minCtc: null, maxCtc: null, includeInGross: true, visibleOnPayslip: true, pfWageBase: true, taxWageBase: true, esicWageBase: true, active: true, reimbursementLimit: null, reimbursementFrequency: null, registerPresentation: "included" as const }],
};
assert.ok(payrollPolicyDraft(policy), "catalog formula and source metadata validate");
assert.equal(payrollPolicyDraft(policy)?.attendanceTreatment.noShiftAttendanceWindowHours, 24, "legacy payroll policies retain the 24-hour no-shift attendance window");
assert.equal(payrollPolicyDraft({ ...policy, attendanceTreatment: { noShiftAttendanceWindowHours: 25 } }), null, "no-shift attendance windows above 24 hours are rejected");
const selected = resolveConfiguration([{ id: "tenant", locationId: null, active: true, effectiveFrom: new Date("2026-01-01"), effectiveTo: null }, { id: "location", locationId: "L1", active: true, effectiveFrom: new Date("2026-02-01"), effectiveTo: null }], "L1", new Date("2026-03-01"));
assert.equal(selected?.id, "location", "location override resolves over tenant default");
const firstIstDay = parseIST("2026-02-01 00:00:00")!;
assert.equal(configurationEffectiveAtISTDay(firstIstDay).toISOString(), "2026-02-01T12:00:00.000Z", "IST attendance dates resolve policies on their intended calendar day");
assert.equal(resolveConfiguration([{ id: "effective-first-day", locationId: "L1", active: true, effectiveFrom: new Date("2026-02-01T00:00:00.000Z"), effectiveTo: null }], "L1", configurationEffectiveAtISTDay(firstIstDay))?.id, "effective-first-day", "a policy effective on the first IST day applies during attendance finalization");
assert.deepEqual(payrollRunPreflight([{ inputSnapshot: { policy: { payrollConfig: {} } } }]), [], "stored payroll snapshot is finalizable");
assert.equal(payrollRunPreflight([{ inputSnapshot: {} }]).length, 1, "missing required operating snapshot blocks finalization");

const baseline = payrollPolicyEditorBaseline(DEFAULT_PAYROLL_CONFIG);
const tenantPayload = {
  ...policy,
  editorExtension: { source: "preserve-me" },
  statutory: { ...policy.statutory, hiddenStatutoryFlag: true },
  components: [{ ...policy.components[0], taxWageBase: true, hiddenCalculatorFlag: "keep" }],
  schedule: { ...policy.schedule, hiddenScheduleKey: 9 },
  statutoryRules: [{ ...policy.statutoryRules[0], calculatorInputs: { ceilingSource: "external" }, hiddenReviewFlag: true }],
};
const editorRecords = [
  { id: "tenant-v1", locationId: null, version: 1, active: true, effectiveFrom: "2026-01-01", effectiveTo: null, payload: tenantPayload },
  { id: "location-v2", locationId: "L1", version: 2, active: true, effectiveFrom: "2026-02-01", effectiveTo: null, payload: { ...tenantPayload, overtimeMultiplier: 2 } },
];
assert.equal(resolvePayrollPolicyEditorSource(editorRecords, "L1", "2026-03-01").record?.id, "location-v2", "editor resolves the selected location override");
assert.equal(resolvePayrollPolicyEditorSource(editorRecords, "L2", "2026-03-01").record?.id, "tenant-v1", "editor resolves the tenant fallback for a location without an override");
assert.equal(resolvePayrollPolicyEditorSource(editorRecords, "L2", "2026-03-01").kind, "tenant_fallback", "tenant fallback is clearly identified");
const cloned = payrollPolicyEditorDraft(tenantPayload, baseline);
assert.equal(cloned.components.length, 1, "existing effective-policy components load into the editor");
assert.equal(cloned.salaryDivisorMethod, "fixed_divisor", "legacy policies default to the existing fixed divisor");
assert.equal(cloned.earnedSalaryRounding, "two_decimals", "legacy policies default to two-decimal rounding");
assert.equal(cloned.earnedSalaryAggregation, "rounded_total", "legacy policies retain aggregate earned-salary rounding");
assert.equal(cloned.attendanceTreatment.noShiftAttendanceWindowHours, 24, "editor exposes the default no-shift attendance window");
assert.equal(cloned.components[0].prorationBasis, "none", "legacy components remain unprorated");
assert.equal(cloned.components[0].applicability, "all", "legacy components remain applicable to all employees");
assert.equal(cloned.components[0].hiddenCalculatorFlag, "keep", "hidden component fields survive draft creation");
assert.deepEqual(cloned.editorExtension, { source: "preserve-me" }, "unknown top-level policy fields survive draft creation");
assert.equal(cloned.statutory.hiddenStatutoryFlag, true, "hidden statutory fields survive draft creation");
assert.equal(cloned.schedule.hiddenScheduleKey, 9, "hidden schedule fields survive draft creation");
assert.equal(cloned.statutoryRules[0].hiddenReviewFlag, true, "hidden source-review fields survive draft creation");
const editedComponent = { ...cloned.components[0], label: "Edited Basic" };
assert.equal((editedComponent as Record<string, unknown>).hiddenCalculatorFlag, "keep", "editing a visible component field preserves hidden attributes");

assert.deepEqual(payrollScheduleExample(30_000, 2, 26, true), { deduction: 2307.69, salaryAfterLop: 27692.31 }, "schedule example matches the engine's fixed-divisor LOP formula");
assert.deepEqual(payrollScheduleExample(30_000, 2, 26, false), { deduction: 0, salaryAfterLop: 30000 }, "schedule example reflects the LOP switch");

const hub = readFileSync(new URL("../app/(portal)/admin/payroll/configuration/payroll-configuration-hub.tsx", import.meta.url), "utf8");
for (const section of ["Pay Schedule", "Statutory Components", "Salary Components", "Tax Details", "Advanced"]) assert.match(hub, new RegExp(section), `${section} navigation is present`);
assert.match(hub, /useSearchParams/, "policy navigation is URL-addressable");
assert.match(hub, /aria-current=\{active \? "page"/, "policy navigation exposes a clear active state");
assert.match(hub, /Preview changes/, "preview action remains available across policy sections");
assert.match(hub, /Save draft/, "single-draft save action remains available across policy sections");
assert.match(hub, /Saving updates the current/, "saving explains that it updates the working draft");
assert.match(hub, /Current Policy/, "HR sees the current policy rather than every intermediate version");
assert.match(hub, /Publish policy/, "publishing remains an explicit current-policy action");
assert.match(hub, /Deactivate/, "published versions can still be deactivated");
assert.match(hub, /Actual calendar days/, "calendar-day salary calculation is exposed");
assert.match(hub, /No-shift attendance window/, "no-shift attendance finalization is configurable per policy");
assert.match(hub, /Round each component, then sum/, "component-level earned-salary aggregation is exposed");
assert.match(hub, /Payable days/, "component payable-day proration is exposed");
assert.match(hub, /Selected employees/, "component assignment applicability is exposed");
assert.doesNotMatch(hub, /work[- ]week/i, "unsupported work-week controls are not exposed");
const configurationApi = readFileSync(new URL("../app/api/configuration/route.ts", import.meta.url), "utf8");
assert.match(configurationApi, /configuration\.update_draft/, "payroll saves audit updates to the working draft");
assert.match(configurationApi, /version: \{ gt: currentPublished\.version \}/, "only drafts newer than the published policy are reused");
console.log("payroll configuration tests passed");
