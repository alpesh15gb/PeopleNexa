import assert from "node:assert/strict";
import { payrollConfigFromSnapshot, resolvePayrollPolicy } from "../lib/payroll-policy";
import { computePayroll, type AttendanceSummary } from "../lib/payroll";

const payload = (multiplier: number) => ({ monthlyDivisor: 30, deductLossOfPay: false, overtimeMultiplier: multiplier, overtimeBasis: "fixed_hourly" as const, statutory: { pfEnabled: false, pfWageCeiling: 9999, esicEnabled: false, esicGrossCeiling: 19999, professionalTaxEnabled: false, professionalTaxState: "Karnataka", labourWelfareFundEnabled: true, tdsEnabled: false, tdsRegime: "old" as const } });
const record = (overrides: Partial<{ id: string; locationId: string | null; version: number; active: boolean; effectiveFrom: Date; effectiveTo: Date | null; payload: unknown }> = {}) => ({ id: "tenant-v1", locationId: null, version: 1, active: true, effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, payload: payload(2), ...overrides });
const tenantConfig = { payroll: { otMultiplier: 1.5, deductAbsentDays: true, pf: { enabled: true, wageCeiling: 15000 } } };

const fallback = resolvePayrollPolicy([], tenantConfig, "loc-1", "2026-06");
assert.equal(fallback.configurationId, null, "missing policy uses Tenant.config");
assert.equal(fallback.appliedRules.payrollConfig.otMultiplier, 1.5);
assert.equal(resolvePayrollPolicy([record({ active: false })], tenantConfig, "loc-1", "2026-06").configurationId, null, "inactive policy falls back");
assert.equal(resolvePayrollPolicy([record({ payload: {} })], tenantConfig, "loc-1", "2026-06").configurationId, null, "invalid policy falls back");

const resolved = resolvePayrollPolicy([record(), record({ id: "location-v2", locationId: "loc-1", version: 2, payload: payload(3) })], tenantConfig, "loc-1", "2026-06");
assert.equal(resolved.configurationId, "location-v2", "location policy overrides tenant policy");
assert.equal(resolved.configurationVersion, 2);
assert.equal(resolved.appliedRules.payrollConfig.otMultiplier, 3);
assert.equal(resolved.appliedRules.payrollConfig.deductAbsentDays, false);
assert.equal(resolved.appliedRules.payrollConfig.pf.enabled, false);
assert.equal(resolved.appliedRules.payrollConfig.pt.state, "Karnataka");
assert.equal(resolved.appliedRules.payrollConfig.otMultiplier, payrollConfigFromSnapshot(resolved.appliedRules)?.otMultiplier, "saved rules recreate the generated config");
const componentPolicy = resolvePayrollPolicy([record({ payload: { ...payload(2), components: [
  { code: "BASIC", label: "Basic", kind: "earning", formula: "percent_of_ctc", amount: 50, minCtc: null, maxCtc: null, includeInGross: true, visibleOnPayslip: true, pfWageBase: true },
  { code: "HRA", label: "HRA", kind: "earning", formula: "percent_of_component", amount: 40, basisComponentCode: "BASIC", minCtc: null, maxCtc: null, includeInGross: true, visibleOnPayslip: true, pfWageBase: false },
  { code: "MESS", label: "Mess", kind: "deduction", formula: "salary_band_fixed", amount: 0, bands: [{ minCtc: 0, maxCtc: 14999, amount: 100 }, { minCtc: 15000, maxCtc: null, amount: 200 }], minCtc: null, maxCtc: null, includeInGross: false, visibleOnPayslip: true, pfWageBase: false },
] } })], tenantConfig, null, "2026-06");
const summary: AttendanceSummary = { presentDays: 26, lateDays: 0, halfDays: 0, absentDays: 0, onLeaveDays: 0, overtimeHours: 0, workingDays: 26, workedHours: 208 };
const componentResult = computePayroll(componentPolicy.appliedRules.payrollConfig, { salary: 20_000 }, summary, 0, "2026-06");
assert.equal(componentResult.basic, 10_000, "configured PF wage-base component is used");
assert.equal(componentResult.grossEarnings, 14_000, "only gross-included components form gross");
assert.equal(componentResult.salaryBreakdown.find((row) => row.label === "Mess")?.amount, 200, "salary-band deduction resolves by CTC");
console.log("payroll policy resolution tests passed");
