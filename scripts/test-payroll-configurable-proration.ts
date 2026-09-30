import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PayrollComponentRule } from "../lib/configuration";
import { payrollPolicyDraft } from "../lib/configuration";
import { assignmentRangesOverlap, resolveAssignedComponentCodes, type PayrollComponentAssignmentRecord } from "../lib/payroll-component-assignments";
import { resolvePayrollPolicy } from "../lib/payroll-policy";
import { calendarDaysInPayrollMonth, computePayroll, DEFAULT_PAYROLL_CONFIG, documentComponents, type AttendanceSummary, type PayrollConfig } from "../lib/payroll";
import { payslipReconciliation } from "../lib/payslip-document";

const component = (value: Partial<PayrollComponentRule> & Pick<PayrollComponentRule, "code" | "label" | "kind" | "formula" | "amount">): PayrollComponentRule => ({
  minCtc: null,
  maxCtc: null,
  includeInGross: value.kind === "earning",
  visibleOnPayslip: true,
  pfWageBase: false,
  active: true,
  prorationBasis: "payable_days",
  applicability: "all",
  ...value,
});

const earnings: PayrollComponentRule[] = [
  component({ code: "WAGE_BASE", label: "Wage base", kind: "earning", formula: "percent_of_ctc", amount: 40, pfWageBase: true }),
  component({ code: "HOUSING", label: "Housing", kind: "earning", formula: "percent_of_component", amount: 50, basisComponentCode: "WAGE_BASE" }),
  component({ code: "TRAVEL", label: "Travel", kind: "earning", formula: "percent_of_ctc", amount: 5 }),
  component({ code: "EDUCATION", label: "Education", kind: "earning", formula: "percent_of_ctc", amount: 5 }),
  component({ code: "HEALTH", label: "Health", kind: "earning", formula: "percent_of_ctc", amount: 10 }),
  component({ code: "LEAVE_TRAVEL", label: "Leave travel", kind: "earning", formula: "percent_of_ctc", amount: 10 }),
  component({ code: "WORKSITE", label: "Worksite", kind: "earning", formula: "percent_of_ctc", amount: 10 }),
];

const config: PayrollConfig = {
  ...DEFAULT_PAYROLL_CONFIG,
  salaryDivisorMethod: "calendar_days",
  earnedSalaryRounding: "floor_rupee",
  components: earnings,
  pf: { ...DEFAULT_PAYROLL_CONFIG.pf, enabled: false },
  esic: { ...DEFAULT_PAYROLL_CONFIG.esic, enabled: false },
  pt: { ...DEFAULT_PAYROLL_CONFIG.pt, enabled: false },
  lwf: { enabled: false },
  tds: { ...DEFAULT_PAYROLL_CONFIG.tds, enabled: false },
  lateFinePerLateDay: 0,
};

const attendance = (presentDays: number, absentDays: number): AttendanceSummary => ({
  presentDays,
  lateDays: 0,
  halfDays: 0,
  absentDays,
  onLeaveDays: 0,
  paidLeaveDays: 0,
  unpaidLeaveDays: 0,
  overtimeHours: 0,
  workingDays: presentDays + absentDays,
  workedHours: presentDays * 8,
});

const first = computePayroll(config, { salary: 55_000 }, attendance(23, 7), 0, "2026-07");
assert.equal(first.divisorUsed, 31);
assert.equal(first.grossEarnings, 55_000, "contractual gross remains intact");
assert.equal(first.earnedGross, 42_580, "31-day earned salary is rounded down once");
assert.equal(first.absentDeduction, 12_420, "LOP bridges contractual and earned salary");
assert.equal(first.salaryBreakdown.filter((row) => row.kind === "earning" && row.includeInGross).reduce((sum, row) => sum + row.earned, 0), 42_580, "earned components reconcile exactly");

const second = computePayroll(config, { salary: 44_000 }, attendance(29, 2), 0, "2026-07");
assert.equal(second.earnedGross, 41_161);
assert.equal(second.salaryBreakdown.filter((row) => row.kind === "earning" && row.includeInGross).reduce((sum, row) => sum + row.earned, 0), 41_161, "deterministic residual closes the whole-rupee total");
assert.equal(second.salaryBreakdown[0].earned, 16_465, "rounding residual uses the configured wage-base rather than a component name");
const paidLeaveSummary = { ...attendance(23, 0), paidLeaveDays: 7, onLeaveDays: 7 };
assert.equal(computePayroll(config, { salary: 55_000 }, paidLeaveSummary, 0, "2026-07").earnedGross, 55_000, "approved paid leave remains payable and is not LOP");

assert.equal(calendarDaysInPayrollMonth("2024-02"), 29, "leap February uses 29 days");
assert.equal(calendarDaysInPayrollMonth("2025-02"), 28, "non-leap February uses 28 days");
assert.equal(computePayroll(config, { salary: 29_000 }, attendance(28, 1), 0, "2024-02").divisorUsed, 29);
assert.equal(computePayroll(config, { salary: 28_000 }, attendance(27, 1), 0, "2025-02").divisorUsed, 28);

const attendanceDeduction = component({ code: "ATTENDANCE_SERVICE", label: "Attendance service", kind: "deduction", formula: "fixed", amount: 1_500, includeInGross: false, prorationBasis: "present_days", applicability: "assigned_employees", prorationRounding: "nearest_rupee" });
const selectedConfig = { ...config, components: [...earnings, attendanceDeduction] };
const assigned23 = computePayroll(selectedConfig, { salary: 55_000 }, attendance(23, 0), 0, "2026-07", [], 0, { assignedComponentCodes: ["ATTENDANCE_SERVICE"] });
const unassigned23 = computePayroll(selectedConfig, { salary: 55_000 }, attendance(23, 0), 0, "2026-07");
assert.equal(assigned23.salaryBreakdown.find((row) => row.code === "ATTENDANCE_SERVICE")?.earned, 1_113);
assert.equal(assigned23.deductions - unassigned23.deductions, 1_113, "an assigned deduction affects totals exactly once");
assert.equal(unassigned23.salaryBreakdown.some((row) => row.code === "ATTENDANCE_SERVICE"), false, "same-salary unassigned employee does not receive the deduction");
const assigned27 = computePayroll(selectedConfig, { salary: 55_000 }, attendance(27, 0), 0, "2026-07", [], 0, { assignedComponentCodes: ["ATTENDANCE_SERVICE"] });
assert.equal(assigned27.salaryBreakdown.find((row) => row.code === "ATTENDANCE_SERVICE")?.earned, 1_306);
const fixedDeductions = [component({ code: "FIXED_A", label: "Fixed A", kind: "deduction", formula: "fixed", amount: 200, includeInGross: false, prorationBasis: "none" }), component({ code: "FIXED_B", label: "Fixed B", kind: "deduction", formula: "fixed", amount: 250, includeInGross: false, prorationBasis: "none" })];
const fixedResult = computePayroll({ ...config, components: [...earnings, ...fixedDeductions] }, { salary: 55_000 }, attendance(31, 0), 0, "2026-07");
assert.equal(fixedResult.deductions, 450, "fixed policy deductions remain generic configured components");

const legacyPayload = {
  monthlyDivisor: 26,
  deductLossOfPay: true,
  overtimeMultiplier: 1.5,
  overtimeBasis: "basic_hourly",
  statutory: { pfEnabled: false, pfWageCeiling: 15_000, esicEnabled: false, esicGrossCeiling: 21_000, professionalTaxEnabled: false, professionalTaxState: "", labourWelfareFundEnabled: false, tdsEnabled: false, tdsRegime: "new" },
};
const parsedLegacy = payrollPolicyDraft(legacyPayload);
assert.equal(parsedLegacy?.salaryDivisorMethod, "fixed_divisor");
assert.equal(parsedLegacy?.earnedSalaryRounding, "two_decimals");
const baseRecord = { id: "policy", locationId: null, version: 1, active: true, effectiveFrom: new Date("2026-01-01T12:00:00.000Z"), effectiveTo: null, payload: legacyPayload };
const explicitRecord = { ...baseRecord, id: "explicit", payload: { ...legacyPayload, salaryDivisorMethod: "fixed_divisor", earnedSalaryRounding: "two_decimals" } };
const legacyConfig = resolvePayrollPolicy([baseRecord], {}, "location", "2026-07").appliedRules.payrollConfig;
const explicitConfig = resolvePayrollPolicy([explicitRecord], {}, "location", "2026-07").appliedRules.payrollConfig;
assert.equal(JSON.stringify(computePayroll(legacyConfig, { salary: 20_000 }, attendance(24, 2), 0, "2026-07")), JSON.stringify(computePayroll(explicitConfig, { salary: 20_000 }, attendance(24, 2), 0, "2026-07")), "missing fields retain byte-equivalent calculation output");

const snapshot = resolvePayrollPolicy([baseRecord], {}, "location", "2026-07");
const frozenSnapshot = JSON.stringify(snapshot);
legacyPayload.monthlyDivisor = 30;
assert.equal(JSON.stringify(snapshot), frozenSnapshot, "resolved policy snapshots do not retain mutable draft references");
const configBefore = JSON.stringify(selectedConfig);
computePayroll(selectedConfig, { salary: 55_000 }, attendance(23, 7), 0, "2026-07", [], 0, { assignedComponentCodes: ["ATTENDANCE_SERVICE"] });
assert.equal(JSON.stringify(selectedConfig), configBefore, "calculation does not mutate policy configuration");

const document = { version: 2 as const, generatedAt: new Date(0).toISOString(), period: "2026-07", policy: { id: null, version: null, source: "test" }, branding: { legalName: "Test", displayName: "Test", address: null, contact: null, logoUrl: null }, employee: { name: "Test", employeeNumber: "TEST", designation: null, department: null, joiningDate: null, bankName: null, accountMasked: null, panMasked: null, uan: null, esiIpNumber: null }, days: { payable: first.payableDays, paid: 23, lop: 7 }, components: documentComponents(first), totals: { gross: first.grossEarnings, earnedGross: first.earnedGross, deductions: first.deductions, net: first.netSalary } };
assert.deepEqual(payslipReconciliation(document), [], "contractual and earned snapshot totals reconcile independently");

const assignment = (overrides: Partial<PayrollComponentAssignmentRecord> = {}): PayrollComponentAssignmentRecord => ({ id: "a", tenantId: "tenant-a", locationId: "location-a", employeeId: "employee-a", componentCode: "ATTENDANCE_SERVICE", effectiveFrom: new Date("2026-01-01T12:00:00.000Z"), effectiveTo: null, active: true, ...overrides });
const assignmentRecords = [assignment(), assignment({ id: "wrong-location", locationId: "location-b", componentCode: "OTHER" }), assignment({ id: "wrong-tenant", tenantId: "tenant-b", componentCode: "OTHER_2" })];
assert.deepEqual(resolveAssignedComponentCodes(assignmentRecords, { tenantId: "tenant-a", locationId: "location-a", employeeId: "employee-a" }, "2026-07"), ["ATTENDANCE_SERVICE"], "assignment resolution is tenant, location, and employee scoped");
assert.equal(assignmentRangesOverlap({ effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-06-30") }, { effectiveFrom: new Date("2026-06-30"), effectiveTo: null }), true, "inclusive assignment boundaries cannot overlap");
assert.equal(assignmentRangesOverlap({ effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-06-29") }, { effectiveFrom: new Date("2026-06-30"), effectiveTo: null }), false);

const assignmentApi = readFileSync(new URL("../app/api/payroll/component-assignments/route.ts", import.meta.url), "utf8");
assert.match(assignmentApi, /session\?\.role !== "admin"/, "only admins can edit component assignments");
assert.match(assignmentApi, /employeeLocationScope\(locationId\)/, "assignment API validates employee branch/location scope");
const migration = readFileSync(new URL("../prisma/migrations/20260930000000_payroll_component_assignments/migration.sql", import.meta.url), "utf8");
assert.match(migration, /EXCLUDE USING GIST/, "database prevents concurrent overlapping assignment periods");
const regenerateApi = readFileSync(new URL("../app/api/payroll/[id]/regenerate/route.ts", import.meta.url), "utf8");
assert.match(regenerateApi, /existing\.status !== "draft"/, "finalized and paid document snapshots cannot be regenerated");
assert.match(regenerateApi, /savedInput\.componentAssignments/, "draft regeneration reuses frozen assignment inputs instead of current assignments");

console.log("configurable payroll proration and assignment tests passed");
