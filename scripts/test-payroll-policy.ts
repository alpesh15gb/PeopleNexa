import assert from "node:assert/strict";
import { payrollConfigFromSnapshot, resolvePayrollPolicy } from "../lib/payroll-policy";

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
console.log("payroll policy resolution tests passed");
