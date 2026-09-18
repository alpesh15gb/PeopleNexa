import { computePayroll, DEFAULT_PAYROLL_CONFIG, type AttendanceSummary } from "../lib/payroll";

const summary: AttendanceSummary = {
  presentDays: 24,
  lateDays: 0,
  halfDays: 0,
  absentDays: 2,
  onLeaveDays: 0,
  overtimeHours: 0,
  workingDays: 26,
  workedHours: 192,
};

const result = computePayroll(DEFAULT_PAYROLL_CONFIG, { salary: 20_000 }, summary, 0, "2026-09");

function expectEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

// Monthly LOP remains a distinct deduction, while statutory wage bases use
// earned pay: PF uses earned basic and ESIC/PT use gross after LOP.
expectEqual(result.absentDeduction, 1538.46, "LOP");
expectEqual(result.pfEmployee, 1107.69, "PF on earned basic");
expectEqual(result.esicEmployee, 138.46, "ESIC on earned gross");
expectEqual(result.professionalTax, 150, "PT on earned gross");

const esicThresholdResult = computePayroll(
  DEFAULT_PAYROLL_CONFIG,
  { salary: 21_500 },
  { ...summary, absentDays: 1, presentDays: 25 },
  0,
  "2026-09"
);
expectEqual(esicThresholdResult.esicEmployee, 155.05, "ESIC eligibility after LOP");

console.log("Payroll LOP statutory scenarios passed.");
