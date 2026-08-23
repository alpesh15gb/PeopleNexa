import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { parseIST } from "./ist";
import { toDateKey } from "./dates";
import { round2 } from "./utils";
import { dateInRange, getWorkCalendarConfig, isAfterLastWorkingDay, isBeforeJoining, isWeeklyOff } from "./work-calendar";

export interface PayrollConfig {
  basicPercent: number;
  /** Legacy setting retained for config compatibility; allowances are the remainder of gross. */
  allowancesPercent: number;
  lateFinePerLateDay: number;
  otMultiplier: number;
  deductAbsentDays: boolean;
  pf: { enabled: boolean; wageCeiling: number };
  esic: { enabled: boolean; grossCeiling: number };
  pt: { enabled: boolean; state: string };
  lwf: { enabled: boolean };
  tds: { enabled: boolean; regime: "new" | "old" };
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  basicPercent: 50,
  allowancesPercent: 50,
  lateFinePerLateDay: 50,
  otMultiplier: 1.5,
  deductAbsentDays: false,
  pf: { enabled: true, wageCeiling: 15000 },
  esic: { enabled: true, grossCeiling: 21000 },
  pt: { enabled: true, state: "Gujarat" },
  lwf: { enabled: false },
  tds: { enabled: true, regime: "new" },
};

export function getPayrollConfig(tenantConfig: unknown): PayrollConfig {
  const cfg = (tenantConfig ?? {}) as { payroll?: Partial<PayrollConfig> };
  const p = cfg.payroll ?? {};
  return {
    basicPercent: p.basicPercent ?? DEFAULT_PAYROLL_CONFIG.basicPercent,
    allowancesPercent: p.allowancesPercent ?? DEFAULT_PAYROLL_CONFIG.allowancesPercent,
    lateFinePerLateDay: p.lateFinePerLateDay ?? DEFAULT_PAYROLL_CONFIG.lateFinePerLateDay,
    otMultiplier: p.otMultiplier ?? DEFAULT_PAYROLL_CONFIG.otMultiplier,
    deductAbsentDays: p.deductAbsentDays ?? DEFAULT_PAYROLL_CONFIG.deductAbsentDays,
    pf: { ...DEFAULT_PAYROLL_CONFIG.pf, ...p.pf },
    esic: { ...DEFAULT_PAYROLL_CONFIG.esic, ...p.esic },
    pt: { ...DEFAULT_PAYROLL_CONFIG.pt, ...p.pt },
    lwf: { ...DEFAULT_PAYROLL_CONFIG.lwf, ...p.lwf },
    tds: { ...DEFAULT_PAYROLL_CONFIG.tds, ...p.tds },
  };
}

export function fyFromMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

export function monthRange(month: string): { start: Date; end: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid payroll month.");
  const [y, m] = month.split("-").map(Number);
  const start = parseIST(`${y}-${String(m).padStart(2, "0")}-01 00:00:00`)!;
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const end = parseIST(`${endY}-${String(endM).padStart(2, "0")}-01 00:00:00`)!;
  return { start, end };
}

export interface AttendanceSummary {
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  onLeaveDays: number;
  overtimeHours: number;
  workingDays: number;
  workedHours: number;
}

export async function attendanceSummary(
  tenantId: string,
  employee: { id: string; shiftId: string | null; joiningDate?: Date | null },
  month: string,
  includeOvertime = true
): Promise<AttendanceSummary> {
  const { start, end } = monthRange(month);
  const [records, leaves, holidays, tenant, exit] = await Promise.all([
    prisma.attendance.findMany({
      where: { tenantId, employeeId: employee.id, date: { gte: start, lt: end } },
      select: { date: true, status: true, punchInTime: true, punchOutTime: true, overtimeMinutes: true, shift: { select: { startTime: true, endTime: true, isNightShift: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId, employeeId: employee.id, status: "approved", fromDate: { lt: end }, toDate: { gte: start } },
      select: { fromDate: true, toDate: true },
    }),
    prisma.holiday.findMany({ where: { tenantId, date: { gte: start, lt: end } }, select: { date: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } }),
    prisma.exitRequest.findFirst({
      where: { tenantId, employeeId: employee.id, status: { in: ["approved", "completed"] } },
      orderBy: { lastWorkingDay: "desc" },
      select: { lastWorkingDay: true },
    }),
  ]);

  const recordByDay = new Map(records.map((r) => [toDateKey(r.date), r]));
  const holidaySet = new Set(holidays.map((h) => toDateKey(h.date)));
  const calendar = getWorkCalendarConfig(tenant?.config ?? null);
  const summary: AttendanceSummary = { presentDays: 0, lateDays: 0, halfDays: 0, absentDays: 0, onLeaveDays: 0, overtimeHours: 0, workingDays: 0, workedHours: 0 };

  for (let d = start; d < end; d = new Date(d.getTime() + 86400000)) {
    if (isBeforeJoining(d, employee.joiningDate) || isAfterLastWorkingDay(d, exit?.lastWorkingDay)) continue;
    const key = toDateKey(d);
    if (holidaySet.has(key) || isWeeklyOff(d, calendar)) continue;
    summary.workingDays++;

    if (leaves.some((l) => dateInRange(d, l.fromDate, l.toDate))) {
      summary.onLeaveDays++;
      continue;
    }

    const rec = recordByDay.get(key);
    if (!rec || rec.status === "absent") { summary.absentDays++; continue; }
    if (rec.status === "present" || rec.status === "permission") summary.presentDays++;
    else if (rec.status === "late") summary.lateDays++;
    else if (rec.status === "half_day") summary.halfDays++;
    else { summary.absentDays++; continue; }

    if (rec.punchInTime && rec.punchOutTime) {
      const spanMin = Math.max(0, (rec.punchOutTime.getTime() - rec.punchInTime.getTime()) / 60000);
      summary.workedHours += spanMin / 60;
      if (includeOvertime) {
        if (rec.overtimeMinutes > 0) summary.overtimeHours += rec.overtimeMinutes / 60;
        else if (rec.shift) {
          const [sh, sm] = rec.shift.startTime.split(":").map(Number);
          const [eh, em] = rec.shift.endTime.split(":").map(Number);
          const scheduled = eh * 60 + em - (sh * 60 + sm) + (rec.shift.isNightShift ? 1440 : 0);
          summary.overtimeHours += Math.max(0, spanMin - scheduled) / 60;
        }
      }
    }
  }
  summary.workedHours = round2(summary.workedHours);
  summary.overtimeHours = round2(summary.overtimeHours);
  return summary;
}

/** Standard EPF contribution; employee-specific excluded-EPS cases are handled at ECR master-data validation. */
export function calcPF(basic: number, config: PayrollConfig) {
  const wage = Math.min(Math.max(basic, 0), Math.max(config.pf.wageCeiling, 0));
  const contribution = config.pf.enabled ? Math.round(wage * 0.12) : 0;
  return { employee: contribution, employer: contribution };
}

/** ESIC 0.75% / 3.25%, rounded up to the next rupee. */
export function calcESIC(gross: number, config: PayrollConfig, averageDailyWage?: number) {
  if (!config.esic.enabled || gross <= 0 || gross > config.esic.grossCeiling) return { employee: 0, employer: 0 };
  const employeeExempt = averageDailyWage !== undefined && averageDailyWage <= 176;
  return {
    employee: employeeExempt ? 0 : Math.ceil(gross * 0.0075),
    employer: Math.ceil(gross * 0.0325),
  };
}

/** Currently certified state pack. Unsupported states fail closed instead of using guessed slabs. */
export function professionalTax(state: string, monthlyGross: number): number {
  const s = state.trim().toLowerCase();
  if (s === "gujarat") return monthlyGross > 12000 ? 200 : 0;
  throw new Error(`Professional-tax rules for ${state || "this state"} are not configured. Disable PT or add a verified state pack before payroll.`);
}

/** Gujarat LWF employee share: June/December only. */
export function labourWelfareFund(state: string, payrollMonth?: string): number {
  const s = state.trim().toLowerCase();
  if (s !== "gujarat") throw new Error(`Labour Welfare Fund rules for ${state || "this state"} are not configured.`);
  if (!payrollMonth) return 0;
  return payrollMonth.endsWith("-06") || payrollMonth.endsWith("-12") ? 6 : 0;
}

function annualIncomeTax(taxable: number, regime: "new" | "old"): number {
  const slabs: Array<[number, number]> = regime === "new"
    ? [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]]
    : [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]];
  let tax = 0;
  let prev = 0;
  for (const [threshold, rate] of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, threshold) - prev) * rate;
    prev = threshold;
  }
  if ((regime === "new" && taxable <= 1200000) || (regime === "old" && taxable <= 500000)) tax = 0;
  // Health & Education Cess, excluding surcharge/marginal-relief cases that
  // require additional employee tax-master data not present in this schema.
  return round2(tax * 1.04);
}

/** Estimated monthly TDS for ordinary salary cases. New regime does not apply 80C/80D-style deductions. */
export function calcTDS(monthlyGross: number, regime: "new" | "old", investments = 0): number {
  const annual = Math.max(0, monthlyGross) * 12;
  const deductibleInvestments = regime === "old" ? Math.min(Math.max(investments, 0), 500000) : 0;
  const standardDeduction = regime === "new" ? 75000 : 50000;
  const taxable = Math.max(0, annual - standardDeduction - deductibleInvestments);
  return round2(annualIncomeTax(taxable, regime) / 12);
}

export interface PayrollAdjustmentInput { id: string; type: string; label: string; amount: number }

export function splitAdjustments(adjustments: PayrollAdjustmentInput[]): { earnings: number; deductions: number; list: { label: string; amount: number }[] } {
  let earnings = 0;
  let deductions = 0;
  const list = adjustments.map((a) => {
    const amount = round2(a.amount);
    if (amount >= 0) earnings += amount; else deductions += Math.abs(amount);
    return { label: a.label || a.type, amount };
  });
  return { earnings: round2(earnings), deductions: round2(deductions), list };
}

export interface LoanDeductionUpdate { id: string; newOutstanding: number; lastDeductedMonth: string; close: boolean }

export function loanDeductionForMonth(
  loans: Array<{ id: string; status: string; startMonth: string; lastDeductedMonth: string | null; outstanding: number; emiAmount: number }>,
  month: string,
  maxDeduction = Infinity
): { total: number; updates: LoanDeductionUpdate[] } {
  let total = 0;
  let remainingCapacity = Math.max(0, maxDeduction);
  const updates: LoanDeductionUpdate[] = [];
  for (const loan of loans) {
    if (loan.status !== "active" || loan.startMonth > month || (loan.lastDeductedMonth && loan.lastDeductedMonth >= month) || loan.outstanding <= 0 || remainingCapacity <= 0) continue;
    const scheduled = loan.emiAmount > 0 ? Math.min(loan.emiAmount, loan.outstanding) : loan.outstanding;
    const ded = Math.min(scheduled, remainingCapacity);
    if (ded <= 0) continue;
    total += ded;
    remainingCapacity -= ded;
    const newOutstanding = round2(loan.outstanding - ded);
    updates.push({ id: loan.id, newOutstanding, lastDeductedMonth: month, close: newOutstanding <= 0 });
  }
  return { total: round2(total), updates };
}

export interface SalaryStructure { basic?: number; hra?: number; conveyance?: number; medical?: number; other?: number }

/** Split gross into Basic + allowances; the components always add back to gross. */
export function splitSalary(total: number, structure: unknown, config: PayrollConfig): { basic: number; allowances: number } {
  const safeTotal = Math.max(0, round2(total));
  const s = (structure ?? {}) as SalaryStructure;
  const pct = Math.min(100, Math.max(0, Number(config.basicPercent) || 0));
  const requestedBasic = s.basic != null && Number.isFinite(Number(s.basic)) && Number(s.basic) >= 0 ? Number(s.basic) : safeTotal * (pct / 100);
  const basic = round2(Math.min(requestedBasic, safeTotal));
  return { basic, allowances: round2(safeTotal - basic) };
}

export interface PayrollResult {
  baseSalary: number; basic: number; allowances: number; overtimePay: number; adjustmentEarnings: number;
  grossEarnings: number; gratuity: number; pfEmployee: number; pfEmployer: number; esicEmployee: number;
  esicEmployer: number; professionalTax: number; lwf: number; tds: number; lateFines: number; loanDeduction: number;
  absentDeduction: number; adjustmentDeductions: number; deductions: number; netSalary: number; presentDays: number;
  lateDays: number; halfDays: number; absentDays: number; overtimeHours: number; workedHours: number;
  adjustments: { label: string; amount: number }[];
}

export function baseForPayMode(mode: string | null | undefined, rate: number, summary: AttendanceSummary): number {
  const paidDays = summary.presentDays + summary.lateDays + summary.halfDays * 0.5 + summary.onLeaveDays;
  const productiveDays = summary.presentDays + summary.lateDays + summary.halfDays * 0.5;
  switch (mode) {
    case "daily": return round2(rate * paidDays);
    case "weekly": return round2(rate * (paidDays / 6));
    case "hourly": return round2(rate * summary.workedHours);
    case "work_basis": return round2(rate * productiveDays);
    default: return round2(rate);
  }
}

function overtimeRate(mode: string, employeeRate: number, contractBasic: number, multiplier: number): number {
  const m = Math.max(0, multiplier);
  if (mode === "hourly") return employeeRate * Math.max(m - 1, 0);
  if (mode === "daily") return (employeeRate / 8) * m;
  if (mode === "weekly") return (employeeRate / 6 / 8) * m;
  if (mode === "work_basis") return 0;
  return (contractBasic / 26 / 8) * m;
}

export function computePayroll(
  config: PayrollConfig,
  employee: { salary: number; salaryStructure?: unknown; payMode?: string | null; workBasisRate?: number | null },
  summary: AttendanceSummary,
  loanDeduction: number,
  adjustments: PayrollAdjustmentInput[] = [],
  investments = 0,
  payrollMonth?: string
): PayrollResult {
  const mode = employee.payMode ?? "monthly";
  const rate = mode === "work_basis" && employee.workBasisRate != null && employee.workBasisRate > 0 ? employee.workBasisRate : employee.salary;
  const contractBase = baseForPayMode(mode, rate, summary);
  const absentDeduction = mode === "monthly" && config.deductAbsentDays && summary.workingDays > 0
    ? round2(Math.min(contractBase, (contractBase / summary.workingDays) * summary.absentDays)) : 0;
  const payableBase = round2(Math.max(0, contractBase - absentDeduction));

  const contractSplit = splitSalary(contractBase, employee.salaryStructure, config);
  const ratio = contractBase > 0 ? payableBase / contractBase : 0;
  let basic = round2(contractSplit.basic * ratio);
  let allowances = round2(payableBase - basic);
  if (!employee.salaryStructure && mode !== "monthly") { basic = payableBase; allowances = 0; }

  const otRate = overtimeRate(mode, rate, contractSplit.basic, config.otMultiplier);
  const overtimePay = round2(summary.overtimeHours * otRate);
  const adj = splitAdjustments(adjustments);
  const gross = round2(payableBase + overtimePay + adj.earnings);
  const gratuity = round2(basic * 0.0481);
  const { employee: pfEmployee, employer: pfEmployer } = calcPF(basic, config);
  const averageDailyWage = summary.workingDays > 0 ? gross / summary.workingDays : undefined;
  const { employee: esicEmployee, employer: esicEmployer } = calcESIC(gross, config, averageDailyWage);
  const pt = config.pt.enabled ? professionalTax(config.pt.state, gross) : 0;
  const lwf = config.lwf.enabled ? labourWelfareFund(config.pt.state, payrollMonth) : 0;
  const tds = config.tds.enabled ? calcTDS(gross, config.tds.regime, investments) : 0;
  const lateFines = round2(summary.lateDays * Math.max(0, config.lateFinePerLateDay));

  const deductionsBeforeLoan = round2(pfEmployee + esicEmployee + pt + lwf + tds + lateFines + adj.deductions);
  const appliedLoan = round2(Math.min(Math.max(0, loanDeduction), Math.max(0, gross - deductionsBeforeLoan)));
  const deductions = round2(deductionsBeforeLoan + appliedLoan);
  const netSalary = round2(Math.max(0, gross - deductions));
  const systemAdjustments = absentDeduction > 0 ? [{ label: "Unpaid absence", amount: -absentDeduction }] : [];

  return {
    baseSalary: payableBase, basic, allowances, overtimePay, adjustmentEarnings: adj.earnings, grossEarnings: gross,
    gratuity, pfEmployee, pfEmployer, esicEmployee, esicEmployer, professionalTax: pt, lwf, tds, lateFines,
    loanDeduction: appliedLoan, absentDeduction, adjustmentDeductions: adj.deductions, deductions, netSalary,
    presentDays: summary.presentDays, lateDays: summary.lateDays, halfDays: summary.halfDays, absentDays: summary.absentDays,
    overtimeHours: round2(summary.overtimeHours), workedHours: round2(summary.workedHours), adjustments: [...adj.list, ...systemAdjustments],
  };
}

export async function generatePayslipForEmployee(
  tenantId: string,
  tenantConfig: unknown,
  employee: { id: string; salary: number; salaryStructure?: unknown; payMode?: string | null; workBasisRate?: number | null; shiftId: string | null; joiningDate?: Date | null },
  month: string
): Promise<{ created: boolean; netSalary?: number; loanApplied?: number }> {
  const existing = await prisma.payslip.findUnique({ where: { employeeId_month: { employeeId: employee.id, month } } });
  if (existing) return { created: false, netSalary: existing.netSalary, loanApplied: existing.loanDeduction };

  const config = getPayrollConfig(tenantConfig);
  const summary = await attendanceSummary(tenantId, employee, month);
  const [loans, adjustments, taxDecl] = await Promise.all([
    prisma.employeeLoan.findMany({ where: { tenantId, employeeId: employee.id }, select: { id: true, status: true, startMonth: true, lastDeductedMonth: true, outstanding: true, emiAmount: true } }),
    prisma.payrollAdjustment.findMany({ where: { tenantId, employeeId: employee.id, month }, select: { id: true, type: true, label: true, amount: true } }),
    prisma.taxDeclaration.findUnique({ where: { employeeId_fy: { employeeId: employee.id, fy: fyFromMonth(month) } }, select: { sections: true, status: true } }),
  ]);

  const decl = (taxDecl?.sections ?? {}) as Record<string, number>;
  const investments = taxDecl?.status === "verified" ? Number(decl.total ?? 0) || 0 : 0;
  const beforeLoan = computePayroll(config, employee, summary, 0, adjustments, investments, month);
  const { total: loanDeduction, updates } = loanDeductionForMonth(loans, month, beforeLoan.netSalary);
  const result = computePayroll(config, employee, summary, loanDeduction, adjustments, investments, month);

  return prisma.$transaction(async (tx) => {
    const raceExisting = await tx.payslip.findUnique({ where: { employeeId_month: { employeeId: employee.id, month } } });
    if (raceExisting) return { created: false, netSalary: raceExisting.netSalary, loanApplied: raceExisting.loanDeduction };

    await tx.payslip.create({ data: {
      tenantId, employeeId: employee.id, month, baseSalary: result.baseSalary, allowances: result.allowances,
      overtimePay: result.overtimePay, grossEarnings: result.grossEarnings, gratuity: result.gratuity,
      pfEmployee: result.pfEmployee, pfEmployer: result.pfEmployer, esicEmployee: result.esicEmployee,
      esicEmployer: result.esicEmployer, professionalTax: result.professionalTax, lwf: result.lwf, tds: result.tds,
      lateFines: result.lateFines, loanDeduction: result.loanDeduction, deductions: result.deductions,
      adjustments: result.adjustments.length ? (result.adjustments as unknown as Prisma.InputJsonValue) : undefined,
      presentDays: Math.round(result.presentDays), lateDays: Math.round(result.lateDays), halfDays: Math.round(result.halfDays),
      absentDays: Math.round(result.absentDays), overtimeHours: result.overtimeHours, workedHours: result.workedHours, netSalary: result.netSalary,
    } });

    for (const u of updates) {
      await tx.employeeLoan.update({ where: { id: u.id }, data: { outstanding: u.newOutstanding, lastDeductedMonth: u.lastDeductedMonth, status: u.close ? "closed" : "active" } });
    }
    return { created: true, netSalary: result.netSalary, loanApplied: result.loanDeduction };
  });
}
