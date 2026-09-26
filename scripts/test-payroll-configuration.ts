import assert from "node:assert/strict";
import { payrollPolicyDraft, resolveConfiguration } from "../lib/configuration";
import { payrollRunPreflight } from "../lib/payroll-preflight";

const policy = {
  monthlyDivisor: 26, deductLossOfPay: true, overtimeMultiplier: 1.5, overtimeBasis: "basic_hourly" as const,
  statutory: { pfEnabled: false, pfWageCeiling: 0, esicEnabled: false, esicGrossCeiling: 0, professionalTaxEnabled: false, professionalTaxState: "", labourWelfareFundEnabled: false, tdsEnabled: false, tdsRegime: "new" as const },
  schedule: { frequency: "monthly" as const, payDateRule: "last_day" as const, attendanceCutoffDay: null, adjustmentCutoffDay: null, reimbursementCutoffDay: null },
  statutoryRules: [{ jurisdiction: "Example", establishment: "Entity A", ruleVersion: "2026.1", sourceReference: "DOC-001", reviewStatus: "pending_legal_review" as const, effectiveFrom: "2026-01-01", effectiveTo: null }],
  components: [{ code: "BASIC", label: "Basic", kind: "earning" as const, formula: "percent_of_ctc" as const, amount: 50, minCtc: null, maxCtc: null, includeInGross: true, visibleOnPayslip: true, pfWageBase: true, taxWageBase: true, esicWageBase: true, active: true, reimbursementLimit: null, reimbursementFrequency: null, registerPresentation: "included" as const }],
};
assert.ok(payrollPolicyDraft(policy), "catalog formula and source metadata validate");
const selected = resolveConfiguration([{ id: "tenant", locationId: null, active: true, effectiveFrom: new Date("2026-01-01"), effectiveTo: null }, { id: "location", locationId: "L1", active: true, effectiveFrom: new Date("2026-02-01"), effectiveTo: null }], "L1", new Date("2026-03-01"));
assert.equal(selected?.id, "location", "location override resolves over tenant default");
assert.deepEqual(payrollRunPreflight([{ inputSnapshot: { policy: { payrollConfig: {} } } }]), [], "stored payroll snapshot is finalizable");
assert.equal(payrollRunPreflight([{ inputSnapshot: {} }]).length, 1, "missing required operating snapshot blocks finalization");
console.log("payroll configuration tests passed");
