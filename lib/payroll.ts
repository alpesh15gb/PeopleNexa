import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { istStartOfDay, parseIST } from "./ist";
import { minutesOfDay } from "./dates";
import { round2 } from "./utils";

// ─── Payroll configuration (per tenant; stored under tenant.config.payroll) ─

export interface PayrollConfig {
  basicPercent: number; // % of base salary treated as Basic (PF wage base)
  allowancesPercent: number; // flat % added as allowances (HRA + special)
  lateFinePerLateDay: number;
  otMultiplier: number; // OT paid at this × (basic/26/8)
  deductAbsentDays: boolean; // pro-rate base by unpaid absent days
  pf: { enabled: boolean; wageCeiling: number };
  esic: { enabled: boolean; grossCeiling: number };
  pt: { enabled: boolean; state: string };
  lwf: { enabled: boolean }; // Labour Welfare Fund — uses the same statutory state as PT
  tds: { enabled: boolean; regime: "new" | "old" };
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  basicPercent: 50,
  allowancesPercent: 12,
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

// ─── Financial year helpers ────────────────────────────────────────────────

/** Financial year for a month key, e.g. "2026-08" → "2026-27". */
export function fyFromMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

// ─── Month window (IST) ─────────────────────────────────────────────────────

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = parseIST(`${y}-${String(m).padStart(2, "0")}-01 00:00:00`)!;
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const end = parseIST(`${endY}-${String(endM).padStart(2, "0")}-01 00:00:00`)!;
  return { start, end };
}

// ─── Attendance summary for one employee-month ──────────────────────────────

export interface AttendanceSummary {
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  onLeaveDays: number;
  overtimeHours: number;
  workingDays: number;
  workedHours: number; // actual hours clocked (used for hourly pay)
}

export async function attendanceSummary(
  tenantId: string,
  employee: { id: string; shiftId: string | null; joiningDate?: Date | null },
  month: string,
  includeOvertime = true
): Promise<AttendanceSummary> {
  const { start, end } = monthRange(month);
  const [records, leaves, holidays, shift, rosters] = await Promise.all([
    prisma.attendance.findMany({
      where: { tenantId, employeeId: employee.id, date: { gte: start, lt: end } },
      select: { date: true, status: true, punchInTime: true, punchOutTime: true },
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId, employeeId: employee.id, status: "approved", fromDate: { lt: end }, toDate: { gte: start } },
      select: { fromDate: true, toDate: true },
    }),
    prisma.holiday.findMany({ where: { tenantId, date: { gte: start, lt: end } }, select: { date: true } }),
    employee.shiftId ? prisma.shift.findUnique({ where: { id: employee.shiftId } }) : null,
    prisma.rosterAssignment.findMany({
      where: { tenantId, employeeId: employee.id, date: { gte: start, lt: end } },
      include: { shift: true },
    }),
  ]);

  const recordByDay = new Map(records.map((r) => [istDayStartKey(r.date), r]));
  const holidaySet = new Set(holidays.map((h) => istDayStartKey(h.date)));

  const summary: AttendanceSummary = {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    onLeaveDays: 0,
    overtimeHours: 0,
    workingDays: 0,
    workedHours: 0,
  };

  const rosterByDay = new Map(rosters.map((r) => [istDayStartKey(r.date), r.shift]));

  for (let d = start; d < end; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    const istDay = new Date(d.getTime() + 5.5 * 3600 * 1000);
    if (istDay.getUTCDay() === 0) continue; // Sunday in the IST wall clock
    const key = istDayStartKey(d);
    if (employee.joiningDate && key < istDayStartKey(employee.joiningDate)) continue;
    if (holidaySet.has(key)) continue;

    const onLeave = leaves.some((l) => istStartOfDay(l.fromDate).getTime() <= d.getTime() && istStartOfDay(l.toDate).getTime() >= d.getTime());
    if (onLeave) {
      summary.onLeaveDays++;
      continue;
    }

    summary.workingDays++;
    const rec = recordByDay.get(key);
    if (!rec) {
      summary.absentDays++;
      continue;
    }
    if (rec.status === "present") summary.presentDays++;
    else if (rec.status === "late") summary.lateDays++;
    else if (rec.status === "half_day") summary.halfDays++;
    else if (rec.status === "permission") summary.presentDays++;
    else summary.absentDays++;

    if (rec.punchInTime && rec.punchOutTime) {
      const spanMin = (rec.punchOutTime.getTime() - rec.punchInTime.getTime()) / 60000;
      summary.workedHours += spanMin / 60;
      const dayShift = rosterByDay.get(key) ?? shift;
      const shiftSpanMin =
        dayShift && dayShift.endTime
          ? minutesOfDay(dayShift.endTime) - minutesOfDay(dayShift.startTime) + (dayShift.isNightShift ? 24 * 60 : 0)
          : 8 * 60;
      if (includeOvertime && dayShift && spanMin > shiftSpanMin) {
        summary.overtimeHours += (spanMin - shiftSpanMin) / 60;
      }
    }
  }

  return summary;
}

function istDayStartKey(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// ─── Statutory calculators ──────────────────────────────────────────────────

const PF_RATE = 0.12;

export function calcPF(basic: number, config: PayrollConfig) {
  const wage = Math.min(basic, config.pf.wageCeiling);
  const employee = config.pf.enabled ? round2(wage * PF_RATE) : 0;
  const employer = config.pf.enabled ? round2(wage * PF_RATE) : 0;
  return { employee, employer };
}

export function calcESIC(gross: number, config: PayrollConfig) {
  if (!config.esic.enabled || gross > config.esic.grossCeiling) return { employee: 0, employer: 0 };
  return { employee: round2(gross * 0.0075), employer: round2(gross * 0.0325) };
}

/** Monthly professional tax by state slab (on monthly gross). */
export function professionalTax(state: string, monthlyGross: number): number {
  const s = state.trim().toLowerCase();
  if (s === "gujarat") {
    if (monthlyGross <= 12000) return 0;
    if (monthlyGross <= 20000) return 150;
    return 200;
  }
  if (s === "maharashtra") {
    if (monthlyGross <= 7500) return 0;
    if (monthlyGross <= 10000) return 175;
    return 200;
  }
  if (s === "karnataka" || s === "tamil nadu" || s === "telangana") {
    if (monthlyGross <= 15000) return 0;
    return 200;
  }
  // Generic fallback
  if (monthlyGross <= 15000) return 0;
  return 200;
}

/** Monthly LWF (Labour Welfare Fund) — employee share by state slab. */
export function labourWelfareFund(state: string, monthlyGross: number): number {
  const s = state.trim().toLowerCase();
  if (s === "gujarat") {
    if (monthlyGross <= 2999) return 10;
    if (monthlyGross <= 5999) return 20;
    if (monthlyGross <= 8999) return 30;
    if (monthlyGross <= 11999) return 40;
    return 50;
  }
  if (s === "maharashtra") return monthlyGross <= 10000 ? 12 : 0;
  if (s === "karnataka") return 40;
  if (s === "tamil nadu") return 10; // quarterly ₹30, pro-rated monthly
  return 0; // states without LWF (e.g. Telangana) or unknown
}

/** Monthly TDS from annualized gross under new/old regime, minus verified investments. */
export function calcTDS(monthlyGross: number, regime: "new" | "old", investments = 0): number {
  const annual = monthlyGross * 12;
  const invested = Math.min(Math.max(investments, 0), 500000); // sanity cap
  let taxable: number;
  let rebateLimit: number;
  let slabs: Array<[number, number]>; // [threshold, rate]

  if (regime === "new") {
    taxable = Math.max(annual - 75000 - invested, 0); // standard deduction
    rebateLimit = 1200000; // 87A rebate under new regime
    slabs = [
      [400000, 0],
      [800000, 0.05],
      [1200000, 0.1],
      [1600000, 0.15],
      [2000000, 0.2],
      [2400000, 0.25],
      [Infinity, 0.3],
    ];
  } else {
    taxable = Math.max(annual - 50000 - invested, 0);
    rebateLimit = 500000;
    slabs = [
      [250000, 0.05],
      [500000, 0.2],
      [Infinity, 0.3],
    ];
  }

  let tax = 0;
  let prev = 0;
  for (const [threshold, rate] of slabs) {
    if (taxable > prev) {
      tax += (Math.min(taxable, threshold) - prev) * rate;
    }
    prev = threshold;
  }
  if (taxable <= rebateLimit) tax = 0; // 87A rebate
  return round2(tax / 12);
}

export interface PayrollAdjustmentInput {
  id: string;
  type: string;
  label: string;
  amount: number;
}

/** Split adjustments into earnings (+) and deductions (−). */
export function splitAdjustments(adjustments: PayrollAdjustmentInput[]): {
  earnings: number;
  deductions: number;
  list: { label: string; amount: number }[];
} {
  let earnings = 0;
  let deductions = 0;
  const list = adjustments.map((a) => {
    const amount = round2(a.amount);
    if (amount >= 0) earnings += amount;
    else deductions += Math.abs(amount);
    return { label: a.label || a.type, amount };
  });
  return { earnings: round2(earnings), deductions: round2(deductions), list };
}

// ─── Loan / advance deduction ───────────────────────────────────────────────

export interface LoanDeductionUpdate {
  id: string;
  newOutstanding: number;
  lastDeductedMonth: string;
  close: boolean;
}

export function loanDeductionForMonth(
  loans: Array<{ id: string; status: string; startMonth: string; lastDeductedMonth: string | null; outstanding: number; emiAmount: number }>,
  month: string
): { total: number; updates: LoanDeductionUpdate[] } {
  let total = 0;
  const updates: LoanDeductionUpdate[] = [];
  for (const loan of loans) {
    if (loan.status !== "active") continue;
    if (loan.startMonth > month) continue;
    if (loan.lastDeductedMonth && loan.lastDeductedMonth >= month) continue;
    if (loan.outstanding <= 0) continue;
    const ded = loan.emiAmount > 0 ? Math.min(loan.emiAmount, loan.outstanding) : loan.outstanding;
    total += ded;
    updates.push({
      id: loan.id,
      newOutstanding: round2(loan.outstanding - ded),
      lastDeductedMonth: month,
      close: loan.outstanding - ded <= 0,
    });
  }
  return { total, updates };
}

// ─── Payroll result ─────────────────────────────────────────────────────────

export interface SalaryStructure {
  basic?: number;
  hra?: number;
  conveyance?: number;
  medical?: number;
  other?: number;
}

/** Split a monthly salary into its components from the structure (if set). */
export function splitSalary(
  total: number,
  structure: unknown,
  config: PayrollConfig
): { basic: number; allowances: number } {
  const s = (structure ?? {}) as SalaryStructure;
  if (s.basic != null && Number.isFinite(s.basic) && s.basic > 0) {
    // Structure set → Basic is explicit; everything else rolls up as allowances.
    const basic = round2(Math.min(s.basic, total));
    return { basic, allowances: round2(Math.max(total - basic, 0)) };
  }
  // Fallback: percentage split.
  return {
    basic: round2(total * (config.basicPercent / 100)),
    allowances: round2(total * (config.allowancesPercent / 100)),
  };
}

export interface PayrollResult {
  baseSalary: number;
  basic: number;
  allowances: number;
  overtimePay: number;
  adjustmentEarnings: number;
  grossEarnings: number;
  gratuity: number;
  pfEmployee: number;
  pfEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  professionalTax: number;
  lwf: number;
  tds: number;
  lateFines: number;
  loanDeduction: number;
  absentDeduction: number;
  adjustmentDeductions: number;
  deductions: number;
  netSalary: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  overtimeHours: number;
  workedHours: number;
  adjustments: { label: string; amount: number }[];
}

/** Compute the base amount for the employee's pay mode. */
export function baseForPayMode(
  mode: string | null | undefined,
  rate: number,
  summary: AttendanceSummary
): number {
  const attended = summary.presentDays + summary.halfDays * 0.5;
  switch (mode) {
    case "daily":
      return round2(rate * attended);
    case "weekly":
      return round2(rate * (attended / 6)); // 6-day week pro-rata
    case "hourly":
      return round2(rate * summary.workedHours);
    case "work_basis":
      return round2(rate * attended);
    default:
      return rate; // monthly — rate is the monthly salary
  }
}

export function computePayroll(
  config: PayrollConfig,
  employee: { salary: number; salaryStructure?: unknown; payMode?: string | null; workBasisRate?: number | null },
  summary: AttendanceSummary,
  loanDeduction: number,
  adjustments: PayrollAdjustmentInput[] = [],
  investments = 0
): PayrollResult {
  const mode = employee.payMode ?? "monthly";
  const rate = mode === "work_basis" && employee.workBasisRate != null && employee.workBasisRate > 0 ? employee.workBasisRate! : employee.salary;
  const base = baseForPayMode(mode, rate, summary);

  let { basic, allowances } = splitSalary(base, employee.salaryStructure, config);
  // Non-monthly workers without an explicit structure: the whole base is basic
  // (no artificial HRA/special allowance split on a daily/hourly wage).
  if (!employee.salaryStructure && mode !== "monthly") {
    basic = round2(base);
    allowances = 0;
  }

  // Overtime pay at (basic / 26 / 8) × multiplier.
  const otRate = (basic / 26 / 8) * config.otMultiplier;
  const overtimePay = round2(summary.overtimeHours * otRate);

  const adj = splitAdjustments(adjustments);
  const gross = round2(base + allowances + overtimePay + adj.earnings);

  // Gratuity: employer contribution, 4.81% of basic (Payment of Gratuity Act).
  const gratuity = round2(basic * 0.0481);

  const { employee: pfEmployee, employer: pfEmployer } = calcPF(basic, config);
  const { employee: esicEmployee, employer: esicEmployer } = calcESIC(gross, config);
  const pt = config.pt.enabled ? professionalTax(config.pt.state, gross) : 0;
  const lwf = config.lwf.enabled ? labourWelfareFund(config.pt.state, gross) : 0;
  const tds = config.tds.enabled ? calcTDS(gross, config.tds.regime, investments) : 0;
  const lateFines = round2(summary.lateDays * config.lateFinePerLateDay);
  const absentDeduction = config.deductAbsentDays ? round2((base / 26) * summary.absentDays) : 0;

  const deductions = round2(
    pfEmployee + esicEmployee + pt + lwf + tds + lateFines + loanDeduction + absentDeduction + adj.deductions
  );
  const netSalary = round2(gross - deductions);

  return {
    baseSalary: round2(base),
    basic,
    allowances,
    overtimePay,
    adjustmentEarnings: adj.earnings,
    grossEarnings: gross,
    gratuity,
    pfEmployee,
    pfEmployer,
    esicEmployee,
    esicEmployer,
    professionalTax: pt,
    lwf,
    tds,
    lateFines,
    loanDeduction,
    absentDeduction,
    adjustmentDeductions: adj.deductions,
    deductions,
    netSalary,
    presentDays: summary.presentDays,
    lateDays: summary.lateDays,
    halfDays: summary.halfDays,
    absentDays: summary.absentDays,
    overtimeHours: round2(summary.overtimeHours),
    workedHours: round2(summary.workedHours),
    adjustments: adj.list,
  };
}

// ─── One-click generator used by the API route and the seed ─────────────────

export async function generatePayslipForEmployee(
  tenantId: string,
  tenantConfig: unknown,
  employee: {
    id: string;
    salary: number;
    salaryStructure?: unknown;
    payMode?: string | null;
    workBasisRate?: number | null;
    shiftId: string | null;
    joiningDate?: Date | null;
  },
  month: string
): Promise<{ created: boolean; netSalary?: number; loanApplied?: number }> {
  const config = getPayrollConfig(tenantConfig);
  const summary = await attendanceSummary(tenantId, employee, month);

  const [loans, adjustments, taxDecl] = await Promise.all([
    prisma.employeeLoan.findMany({
      where: { tenantId, employeeId: employee.id },
      select: { id: true, status: true, startMonth: true, lastDeductedMonth: true, outstanding: true, emiAmount: true },
    }),
    prisma.payrollAdjustment.findMany({
      where: { tenantId, employeeId: employee.id, month },
      select: { id: true, type: true, label: true, amount: true },
    }),
    prisma.taxDeclaration.findUnique({
      where: { employeeId_fy: { employeeId: employee.id, fy: fyFromMonth(month) } },
      select: { sections: true, status: true },
    }),
  ]);
  const { total: loanDeduction, updates } = loanDeductionForMonth(loans, month);

  const decl = (taxDecl?.sections ?? {}) as Record<string, number>;
  const investments = taxDecl?.status === "verified" ? Number(decl.total ?? 0) || 0 : 0;

  const result = computePayroll(config, employee, summary, loanDeduction, adjustments, investments);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.payslip.findUnique({
      where: { employeeId_month: { employeeId: employee.id, month } },
    });
    if (existing) return { created: false, netSalary: existing.netSalary, loanApplied: loanDeduction };

    await tx.payslip.create({
      data: {
        tenantId,
        employeeId: employee.id,
        month,
        baseSalary: result.baseSalary,
        basicSalary: result.basic,
        allowances: result.allowances,
        overtimePay: result.overtimePay,
        grossEarnings: result.grossEarnings,
        gratuity: result.gratuity,
        pfEmployee: result.pfEmployee,
        pfEmployer: result.pfEmployer,
        esicEmployee: result.esicEmployee,
        esicEmployer: result.esicEmployer,
        professionalTax: result.professionalTax,
        lwf: result.lwf,
        tds: result.tds,
        lateFines: result.lateFines,
        loanDeduction: result.loanDeduction,
        deductions: result.deductions,
        adjustments: result.adjustments.length > 0 ? (result.adjustments as unknown as Prisma.InputJsonValue) : undefined,
        presentDays: result.presentDays,
        lateDays: result.lateDays,
        halfDays: result.halfDays,
        absentDays: result.absentDays,
        overtimeHours: result.overtimeHours,
        workedHours: result.workedHours,
        netSalary: result.netSalary,
      },
    });

    for (const u of updates) {
      await tx.employeeLoan.update({
        where: { id: u.id },
        data: { outstanding: u.newOutstanding, lastDeductedMonth: u.lastDeductedMonth, status: u.close ? "closed" : "active" },
      });
    }

    return { created: true, netSalary: result.netSalary, loanApplied: loanDeduction };
  });
}
