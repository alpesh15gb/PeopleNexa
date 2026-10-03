import { computePayroll, DEFAULT_PAYROLL_CONFIG, professionalTax, type AttendanceSummary } from "../lib/payroll";

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

// Telangana slab boundaries must remain inclusive at 15,000 and 20,000,
// including fractional earnings produced by monthly proration.
for (const [gross, tax] of [[0, 0], [15000, 0], [15000.01, 150], [15001, 150], [19999.99, 150], [20000, 150], [20000.01, 200]]) {
  expectEqual(professionalTax(" Telangana ", gross, "2026-09"), tax, `Telangana PT at ${gross}`);
}
const telanganaConfig = {
  ...DEFAULT_PAYROLL_CONFIG,
  salaryDivisorMethod: "calendar_days" as const,
  pt: { enabled: true, state: "Telangana" },
  pf: { ...DEFAULT_PAYROLL_CONFIG.pf, enabled: false },
  esic: { ...DEFAULT_PAYROLL_CONFIG.esic, enabled: false },
  tds: { ...DEFAULT_PAYROLL_CONFIG.tds, enabled: false },
  lwf: { enabled: false },
};
for (const [salary, present, absent, earned, tax] of [
  [24000, 20, 10, 16000, 150],
  [60000, 10, 20, 20000, 150],
  [40000, 10, 20, 13333.33, 0],
  [110000, 0, 30, 0, 0],
  [24000, 30, 0, 24000, 200],
]) {
  const calculated = computePayroll(telanganaConfig, { salary }, { ...summary, presentDays: present, absentDays: absent, workingDays: 30, workedHours: present * 8 }, 0, "2026-09");
  expectEqual(calculated.earnedGross, earned, `Telangana earned gross at ${salary}/${present}`);
  expectEqual(calculated.professionalTax, tax, `Telangana PT after LOP at ${salary}/${present}`);
  expectEqual(calculated.netSalary, Math.max(0, Math.round((earned - tax) * 100) / 100), `Telangana PT deducted once at ${salary}/${present}`);
}

console.log("Payroll LOP statutory scenarios passed.");
