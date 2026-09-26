import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";
import { istStartOfDay, parseIST } from "./ist";
import { minutesOfDay } from "./dates";
import { round2 } from "./utils";
import type { PayrollPolicySnapshot } from "./payroll-policy";
import type { PayrollComponentRule } from "./configuration";
import { mask, type PayslipComponent, type PayslipDocumentSnapshot } from "./payslip-document";

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
  components?: PayrollComponentRule[];
  monthlyDivisor?: number;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  basicPercent: 50,
  allowancesPercent: 12,
  lateFinePerLateDay: 50,
  otMultiplier: 1.5,
  deductAbsentDays: true,
  pf: { enabled: true, wageCeiling: 15000 },
  esic: { enabled: true, grossCeiling: 21000 },
  pt: { enabled: true, state: "Gujarat" },
  lwf: { enabled: false },
  tds: { enabled: true, regime: "new" },
};

export function getPayrollConfig(tenantConfig: unknown): PayrollConfig {
  const cfg = (tenantConfig ?? {}) as { payroll?: Partial<PayrollConfig> };
  const p = cfg.payroll ?? {};
  const clampPct = (v: unknown, fallback: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(100, Math.max(0, n));
  };
  // basicPercent is clamped to min 10 so basic (PF/OT wage base) never
  // silently zeroes out on a misconfigured tenant.
  const clampBasicPct = (v: unknown, fallback: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(100, Math.max(10, n));
  };
  const nonNeg = (v: unknown, fallback: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.max(0, n);
  };
  return {
    basicPercent: clampBasicPct(p.basicPercent, DEFAULT_PAYROLL_CONFIG.basicPercent),
    // allowancesPercent is kept for display only; splitSalary derives allowances = base - basic
    // so the two always sum to 100%. Negative / >100 values are clamped.
    allowancesPercent: clampPct(p.allowancesPercent, DEFAULT_PAYROLL_CONFIG.allowancesPercent),
    lateFinePerLateDay: nonNeg(p.lateFinePerLateDay, DEFAULT_PAYROLL_CONFIG.lateFinePerLateDay),
    otMultiplier: nonNeg(p.otMultiplier, DEFAULT_PAYROLL_CONFIG.otMultiplier),
    deductAbsentDays: p.deductAbsentDays ?? DEFAULT_PAYROLL_CONFIG.deductAbsentDays,
    pf: {
      enabled: p.pf?.enabled ?? DEFAULT_PAYROLL_CONFIG.pf.enabled,
      wageCeiling: nonNeg(p.pf?.wageCeiling, DEFAULT_PAYROLL_CONFIG.pf.wageCeiling),
    },
    esic: {
      enabled: p.esic?.enabled ?? DEFAULT_PAYROLL_CONFIG.esic.enabled,
      grossCeiling: nonNeg(p.esic?.grossCeiling, DEFAULT_PAYROLL_CONFIG.esic.grossCeiling),
    },
    pt: { ...DEFAULT_PAYROLL_CONFIG.pt, ...p.pt },
    lwf: { ...DEFAULT_PAYROLL_CONFIG.lwf, ...p.lwf },
    tds: { ...DEFAULT_PAYROLL_CONFIG.tds, ...p.tds },
    components: Array.isArray(p.components) ? p.components as PayrollComponentRule[] : undefined,
    monthlyDivisor: Math.max(1, Math.min(366, nonNeg(p.monthlyDivisor, 26) || 26)),
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
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  legacyLeavePayWarning?: boolean;
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
      select: { fromDate: true, toDate: true, leaveType: { select: { paid: true } }, leavePolicySnapshot: true },
    }),
    prisma.holiday.findMany({
      where: { tenantId, OR: [{ date: { gte: start, lt: end } }, { isRecurring: true }] },
      select: { date: true, isRecurring: true },
    }),
    employee.shiftId ? prisma.shift.findUnique({ where: { id: employee.shiftId } }) : null,
    prisma.rosterAssignment.findMany({
      where: { tenantId, employeeId: employee.id, date: { gte: start, lt: end } },
      include: { shift: true },
    }),
  ]);

  const recordByDay = new Map(records.map((r) => [istDayStartKey(r.date), r]));
  const holidaySet = new Set(holidays.map((h) => istDayStartKey(h.date)));
  const recurringHolidaySet = new Set(
    holidays.filter((h) => h.isRecurring).map((h) => istDayStartKey(h.date).slice(5))
  );

  const summary: AttendanceSummary = {
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    onLeaveDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    legacyLeavePayWarning: false,
    overtimeHours: 0,
    workingDays: 0,
    workedHours: 0,
  };

  const rosterByDay = new Map(rosters.map((r) => [istDayStartKey(r.date), r.shift]));

  // Paid-hours (worked/overtime) are tracked separately from the
  // workingDays denominator: punched hours count on holidays and on-leave
  // days, while workingDays stays as-is.
  const accumulateHours = (key: string, rec: { punchInTime: Date | null; punchOutTime: Date | null } | undefined) => {
    if (!rec?.punchInTime || !rec?.punchOutTime) return;
    const spanMin = (rec.punchOutTime.getTime() - rec.punchInTime.getTime()) / 60000;
    if (!Number.isFinite(spanMin) || spanMin < 0) return;
    summary.workedHours += spanMin / 60;
    const dayShift = rosterByDay.get(key) ?? shift;
    const shiftSpanMin =
      dayShift && dayShift.endTime
        ? minutesOfDay(dayShift.endTime) - minutesOfDay(dayShift.startTime) + (dayShift.isNightShift ? 24 * 60 : 0)
        : 8 * 60;
    if (includeOvertime && dayShift && spanMin > shiftSpanMin) {
      summary.overtimeHours += (spanMin - shiftSpanMin) / 60;
    }
  };

  for (let d = start; d < end; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    const istDay = new Date(d.getTime() + 5.5 * 3600 * 1000);
    const key = istDayStartKey(d);
    if (employee.joiningDate && key < istDayStartKey(employee.joiningDate)) continue;
    if (holidaySet.has(key) || recurringHolidaySet.has(key.slice(5))) {
      accumulateHours(key, recordByDay.get(key));
      continue;
    }

    const leave = leaves.find((l) => istStartOfDay(l.fromDate).getTime() <= d.getTime() && istStartOfDay(l.toDate).getTime() >= d.getTime());
    if (leave) {
      summary.onLeaveDays++;
      const snapshotPaid = (leave.leavePolicySnapshot as { rules?: { paid?: unknown } } | null)?.rules?.paid;
      const paid = typeof snapshotPaid === "boolean" ? snapshotPaid : leave.leaveType.paid;
      if (paid === false) summary.unpaidLeaveDays = (summary.unpaidLeaveDays ?? 0) + 1;
      else { summary.paidLeaveDays = (summary.paidLeaveDays ?? 0) + 1; if (paid == null) summary.legacyLeavePayWarning = true; }
      accumulateHours(key, recordByDay.get(key));
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

    accumulateHours(key, rec);
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

/** Monthly professional tax by state slab (on monthly gross). month is YYYY-MM. */
export function professionalTax(state: string, monthlyGross: number, month: string): number {
  const s = state.trim().toLowerCase();
  if (s === "gujarat") {
    if (monthlyGross <= 12000) return 0;
    if (monthlyGross <= 20000) return 150;
    return 200;
  }
  if (s === "maharashtra") {
    if (monthlyGross <= 7500) return 0;
    if (monthlyGross <= 10000) return 175;
    // Maharashtra: February is charged at ₹300, other months ₹200.
    const mm = month.slice(5, 7);
    if (mm === "02") return 300;
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

/** Monthly LWF (Labour Welfare Fund) — employee share by state slab.
 *  Only payable in June and December; 0 in all other months. month is YYYY-MM. */
export function labourWelfareFund(state: string, monthlyGross: number, month: string): number {
  const mm = month.slice(5, 7);
  if (mm !== "06" && mm !== "12") return 0;
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
    // New regime: only the standard deduction applies. 80C/HRA-style
    // investments must NOT reduce taxable income here.
    taxable = Math.max(annual - 75000, 0); // standard deduction
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
      [250000, 0],
      [500000, 0.05],
      [1000000, 0.2],
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
  else if (regime === "new" && taxable > 1200000) {
    // New-regime 87A marginal relief: tax just above the ₹12L boundary is
    // capped at the excess over ₹12L plus the (rebated) tax at the boundary.
    // Tax at exactly ₹12L gets full rebate, so baseAtBoundary is 0.
    let boundaryTax = 0;
    let bPrev = 0;
    for (const [threshold, rate] of slabs) {
      if (1200000 > bPrev) {
        boundaryTax += (Math.min(1200000, threshold) - bPrev) * rate;
      }
      bPrev = threshold;
    }
    const baseAtBoundary = 1200000 <= rebateLimit ? 0 : boundaryTax;
    const cap = taxable - 1200000 + baseAtBoundary;
    if (tax > cap) tax = cap;
  }
  // 4% health & education cess, converted to a monthly figure.
  return round2((tax * 1.04) / 12);
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
  month: string,
  maxLoan?: number
): { total: number; updates: LoanDeductionUpdate[] } {
  // Collect eligible loans in EMI order first (uncapped per-loan amounts).
  const eligible: Array<{ loan: (typeof loans)[number]; ded: number }> = [];
  for (const loan of loans) {
    if (loan.status !== "active") continue;
    if (loan.startMonth > month) continue;
    if (loan.lastDeductedMonth && loan.lastDeductedMonth >= month) continue;
    if (loan.outstanding <= 0) continue;
    const ded = loan.emiAmount > 0 ? Math.min(loan.emiAmount, loan.outstanding) : loan.outstanding;
    eligible.push({ loan, ded });
  }
  const uncapped = eligible.reduce((s, e) => s + e.ded, 0);
  const cap = maxLoan === undefined ? uncapped : Math.max(0, Math.min(maxLoan, uncapped));
  // Allocate the capped total in EMI order, rewriting per-loan updates.
  let remaining = cap;
  let total = 0;
  const updates: LoanDeductionUpdate[] = [];
  for (const { loan, ded } of eligible) {
    if (remaining <= 0) break;
    const alloc = Math.min(ded, remaining);
    if (alloc <= 0) continue;
    total += alloc;
    remaining -= alloc;
    updates.push({
      id: loan.id,
      newOutstanding: round2(loan.outstanding - alloc),
      lastDeductedMonth: month,
      close: loan.outstanding - alloc <= 0,
    });
  }
  return { total: round2(total), updates };
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
  // Fallback: basic is a % of base; allowances are the remainder so the
  // two always sum to 100% of base (no double-count downstream).
  // Clamped to min 10 so basic never silently zeroes (PF/OT guard).
  const pct = Math.min(100, Math.max(10, config.basicPercent));
  const basic = round2(total * (pct / 100));
  return {
    basic,
    allowances: round2(Math.max(total - basic, 0)),
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
  workingDays: number;
  onLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  divisorUsed: number;
  adjustments: { label: string; amount: number }[];
  salaryBreakdown: { label: string; amount: number; kind: "earning" | "deduction"; includeInGross: boolean; visibleOnPayslip: boolean }[];
}

/** Compute the base amount for the employee's pay mode. */
export function baseForPayMode(
  mode: string | null | undefined,
  rate: number,
  summary: AttendanceSummary
): number {
  // Late days count fully as worked (late = worked). Permission rows are
  // already folded into presentDays by attendanceSummary — keep that.
  const attended = summary.presentDays + summary.lateDays + summary.halfDays * 0.5;
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

/** Apply the joining-month salary proration used when a payslip is generated. */
export function payrollEmployeeForMonth<T extends { salary: number; payMode?: string | null; joiningDate?: Date | null }>(
  employee: T,
  month: string
): T {
  const { start: mStart, end: mEnd } = monthRange(month);
  const empMode = employee.payMode ?? "monthly";
  if (empMode !== "monthly" || !employee.joiningDate) return employee;

  const joinStart = istStartOfDay(new Date(employee.joiningDate));
  if (joinStart.getTime() <= mStart.getTime()) return employee;

  const msPerDay = 24 * 3600 * 1000;
  const daysInMonth = Math.round((mEnd.getTime() - mStart.getTime()) / msPerDay);
  const employedStart = joinStart.getTime() > mStart.getTime() ? joinStart : mStart;
  const employedDays = Math.round((mEnd.getTime() - employedStart.getTime()) / msPerDay);
  const clamped = Math.min(Math.max(employedDays, 0), daysInMonth);
  return daysInMonth > 0
    ? { ...employee, salary: round2(employee.salary * (clamped / daysInMonth)) }
    : employee;
}

export function computePayroll(
  config: PayrollConfig,
  employee: { salary: number; salaryStructure?: unknown; payMode?: string | null; workBasisRate?: number | null },
  summary: AttendanceSummary,
  loanDeduction: number,
  month: string,
  adjustments: PayrollAdjustmentInput[] = [],
  investments = 0
): PayrollResult {
  const mode = employee.payMode ?? "monthly";
  const rate = mode === "work_basis" && employee.workBasisRate != null && employee.workBasisRate > 0 ? employee.workBasisRate! : employee.salary;
  const base = baseForPayMode(mode, rate, summary);

  let { basic, allowances } = splitSalary(base, employee.salaryStructure, config);
  const configured = calculatePolicyComponents(config.components, base);
  if (configured) {
    basic = configured.basic;
    allowances = configured.allowances;
  }
  // Non-monthly workers without an explicit structure: the whole base is basic
  // (no artificial HRA/special allowance split on a daily/hourly wage).
  if (!employee.salaryStructure && mode !== "monthly") {
    basic = round2(base);
    allowances = 0;
  }

  // `base` already includes the basic+allowances split, so gross must NOT add
  // allowances again (that double-counted pay).
  // A policy's monthly divisor is applied consistently to LOP and monthly OT.
  const divisor = config.monthlyDivisor ?? 26;
  const divisorUsed = divisor;
  // Overtime branches by pay mode:
  // - hourly: rate is the hourly rate → pay rate × multiplier × hours (no /26).
  // - daily / work_basis: day rate is the daily rate → (rate/8) × multiplier.
  // - weekly: weekly rate covers a 6-day week → (rate/6/8) × multiplier.
  // - monthly: (basic/26/8) × multiplier with divisor frozen at 26.
  let overtimePay: number;
  if (mode === "hourly") {
    // Worked hours already include overtime in the hourly base. Pay only the
    // premium here, otherwise overtime hours are paid twice.
    overtimePay = round2(rate * Math.max(config.otMultiplier - 1, 0) * summary.overtimeHours);
  } else if (mode === "daily" || mode === "work_basis") {
    const otRate = (rate / 8) * config.otMultiplier;
    overtimePay = round2(summary.overtimeHours * otRate);
  } else if (mode === "weekly") {
    const otRate = (rate / 6 / 8) * config.otMultiplier;
    overtimePay = round2(summary.overtimeHours * otRate);
  } else {
    const otRate = divisorUsed > 0 && basic > 0 ? (basic / divisorUsed / 8) * config.otMultiplier : 0;
    overtimePay = round2(summary.overtimeHours * otRate);
  }

  const adj = splitAdjustments(adjustments);
  const gross = round2((configured?.grossEarnings ?? base) + overtimePay + adj.earnings);

  // Gratuity: employer contribution, 4.81% of basic (Payment of Gratuity Act).
  const gratuity = round2(basic * 0.0481);

  const lateFines = round2(summary.lateDays * config.lateFinePerLateDay);
  // For daily/hourly/work-basis pay, `base` is already pro-rated by attendance —
  // applying an extra absent deduction would deduct twice.
  const unpaidDayFractions = summary.absentDays + summary.halfDays * 0.5 + (summary.unpaidLeaveDays ?? 0);
  const absentDeduction =
    config.deductAbsentDays && mode === "monthly" && divisor > 0
      ? round2((base / divisor) * unpaidDayFractions)
      : 0;

  // LOP is displayed separately, but statutory wage bases must reflect the pay
  // earned after LOP. Allocate LOP across basic and allowances proportionally;
  // this preserves an explicit salary structure instead of taking all LOP from
  // basic. Earnings adjustments and overtime retain their existing treatment.
  const earnedBasic = base > 0 ? round2(Math.max(0, basic - (absentDeduction * basic) / base)) : 0;
  const earnedGross = round2(Math.max(0, gross - absentDeduction));
  const { employee: pfEmployee, employer: pfEmployer } = calcPF(earnedBasic, config);
  const { employee: esicEmployee, employer: esicEmployer } = calcESIC(earnedGross, config);
  const pt = config.pt.enabled ? professionalTax(config.pt.state, earnedGross, month) : 0;
  const lwf = config.lwf.enabled ? labourWelfareFund(config.pt.state, earnedGross, month) : 0;
  const tds = config.tds.enabled ? calcTDS(earnedGross, config.tds.regime, investments) : 0;

  // Cap loan deduction so net can never go negative because of loans alone.
  const configuredDeductions = configured?.deductions ?? 0;
  const statutoryAndOther = pfEmployee + esicEmployee + pt + lwf + tds + lateFines + absentDeduction + adj.deductions + configuredDeductions;
  const maxLoan = Math.max(0, gross - statutoryAndOther);
  const cappedLoan = round2(Math.min(Math.max(loanDeduction, 0), maxLoan));

  const deductions = round2(
    pfEmployee + esicEmployee + pt + lwf + tds + lateFines + cappedLoan + absentDeduction + adj.deductions + configuredDeductions
  );
  const netSalary = Math.max(0, round2(gross - deductions));

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
    loanDeduction: cappedLoan,
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
    workingDays: summary.workingDays,
    onLeaveDays: summary.onLeaveDays,
    paidLeaveDays: summary.paidLeaveDays ?? 0,
    unpaidLeaveDays: summary.unpaidLeaveDays ?? 0,
    divisorUsed,
    adjustments: adj.list,
    salaryBreakdown: configured?.rows ?? [],
  };
}

function calculatePolicyComponents(rules: PayrollComponentRule[] | undefined, monthlyBase: number) {
  // Employer benefits, reimbursements, variable and one-time catalog entries
  // are deliberately not inferred into payroll amounts by this engine.
  const operationalRules = rules?.filter((rule): rule is PayrollComponentRule & { kind: "earning" | "deduction"; formula: "fixed" | "percent_of_ctc" | "percent_of_component" | "salary_band_fixed" } => rule.active !== false && (rule.kind === "earning" || rule.kind === "deduction") && !["variable", "one_time"].includes(rule.formula)) ?? [];
  if (!operationalRules.length) return null;
  const values = new Map<string, number>();
  const rows: PayrollResult["salaryBreakdown"] = [];
  for (const rule of operationalRules) {
    // Component rules are evaluated against the monthly payroll base. Their
    // historical "CTC" labels are not treated as annual CTC implicitly.
    const eligible = (rule.minCtc === null || monthlyBase >= rule.minCtc) && (rule.maxCtc === null || monthlyBase <= rule.maxCtc);
    let amount = 0;
    if (eligible) {
      if (rule.formula === "fixed") amount = rule.amount;
      else if (rule.formula === "percent_of_ctc") amount = monthlyBase * rule.amount / 100;
      else if (rule.formula === "percent_of_component") amount = (values.get(rule.basisComponentCode!) ?? 0) * rule.amount / 100;
      else amount = rule.bands?.find((band) => monthlyBase >= band.minCtc && (band.maxCtc === null || monthlyBase <= band.maxCtc))?.amount ?? 0;
    }
    amount = round2(amount); values.set(rule.code, amount);
    rows.push({ label: rule.label, amount, kind: rule.kind, includeInGross: rule.includeInGross, visibleOnPayslip: rule.visibleOnPayslip });
  }
  const wageBase = operationalRules.find((rule) => rule.pfWageBase);
  const grossEarnings = round2(rows.filter((row) => row.kind === "earning" && row.includeInGross).reduce((sum, row) => sum + row.amount, 0));
  const allowances = round2(rows.filter((row, index) => row.kind === "earning" && operationalRules[index].code !== wageBase?.code).reduce((sum, row) => sum + row.amount, 0));
  return { basic: wageBase ? values.get(wageBase.code) ?? 0 : 0, allowances, grossEarnings, deductions: round2(rows.filter((row) => row.kind === "deduction").reduce((sum, row) => sum + row.amount, 0)), rows };
}

function documentComponents(result: PayrollResult): PayslipComponent[] {
  const configured = (result.salaryBreakdown ?? []).map((row, index) => ({
    code: `CONFIG_${index}`, label: row.label, category: row.kind, contractual: row.amount,
    // LOP is a separately rendered deduction in the existing ledger, so the
    // earning register remains the contractual gross and reconciles to gross.
    earned: row.amount,
    includeInGross: row.includeInGross, visibleOnPayslip: row.visibleOnPayslip, nonCash: false,
  } satisfies PayslipComponent));
  const rows: PayslipComponent[] = configured.length ? configured : [
    { code: "BASIC", label: "Basic", category: "earning" as const, contractual: result.basic, earned: result.basic, includeInGross: true, visibleOnPayslip: true, nonCash: false },
    { code: "ALLOWANCES", label: "Allowances", category: "earning" as const, contractual: result.allowances, earned: result.allowances, includeInGross: true, visibleOnPayslip: true, nonCash: false },
  ];
  const add = (code: string, label: string, earned: number, category: "earning" | "deduction") => { if (earned) rows.push({ code, label, category, contractual: null, earned, includeInGross: category === "earning", visibleOnPayslip: true, nonCash: false }); };
  add("OVERTIME", "Overtime", result.overtimePay, "earning"); add("ADJUSTMENTS", "Adjustments", result.adjustmentEarnings, "earning");
  add("EPF", "EPF", result.pfEmployee, "deduction"); add("ESIC", "ESIC", result.esicEmployee, "deduction"); add("PT", "Professional Tax", result.professionalTax, "deduction"); add("LWF", "Labour Welfare Fund", result.lwf, "deduction"); add("TDS", "TDS", result.tds, "deduction"); add("LATE_FINE", "Late Fine", result.lateFines, "deduction"); add("LOAN", "Loan / Advance", result.loanDeduction, "deduction"); add("LOP", "LOP Deduction", result.absentDeduction, "deduction"); add("ADJUSTMENTS_DEDUCTION", "Adjustments", result.adjustmentDeductions, "deduction");
  return rows;
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
    employeeNumber?: string;
    firstName?: string;
    lastName?: string;
    branchId?: string | null;
    locationId?: string | null;
    departmentId?: string | null;
    position?: string | null;
    branchName?: string | null;
    departmentName?: string | null;
    pan?: string | null;
    uan?: string | null;
    esiIpNumber?: string | null;
    pfAllowed?: boolean | null;
    esicAllowed?: boolean | null;
    tdsAllowed?: boolean | null;
    bankName?: string | null;
    accountNumber?: string | null;
    ifscCode?: string | null;
  },
  month: string,
  policySnapshot?: PayrollPolicySnapshot,
  payrollRunId?: string
): Promise<{ created: boolean; netSalary?: number; loanApplied?: number; skipped?: string }> {
  // Skip employees who join on/after the month's exclusive end.
  const { start: mStart, end: mEnd } = monthRange(month);
  if (employee.joiningDate) {
    const joinStart = istStartOfDay(new Date(employee.joiningDate));
    if (joinStart.getTime() >= mEnd.getTime()) {
      return { created: false, skipped: "not-joined" };
    }
  }
  // Daily/hourly paths stay attendance-driven via baseForPayMode.
  const payEmployee = payrollEmployeeForMonth(employee, month);

  const configured = policySnapshot?.appliedRules.payrollConfig ?? getPayrollConfig(tenantConfig);
  // Employee-level applicability is an explicit opt-out; policy rates remain
  // tenant-configured rather than being hardcoded here.
  const config: PayrollConfig = {
    ...configured,
    pf: { ...configured.pf, enabled: configured.pf.enabled && employee.pfAllowed !== false },
    esic: { ...configured.esic, enabled: configured.esic.enabled && employee.esicAllowed !== false },
    tds: { ...configured.tds, enabled: configured.tds.enabled && employee.tdsAllowed !== false },
  };
  const summary = await attendanceSummary(tenantId, employee, month);

  const [loans, adjustments, taxDecl, tenant] = await Promise.all([
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
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, address: true, email: true, phone: true, profile: { select: { legalName: true, displayName: true, address: true, contactEmail: true, contactPhone: true, logoUrl: true } } } }),
  ]);
  const { total: loanDeduction } = loanDeductionForMonth(loans, month);

  const decl = (taxDecl?.sections ?? {}) as Record<string, number>;
  const investments = taxDecl?.status === "verified" ? Number(decl.total ?? 0) || 0 : 0;

  const result = computePayroll(config, payEmployee, summary, loanDeduction, month, adjustments, investments);
  // Re-allocate the capped loan total across loans in EMI order so the
  // persisted per-loan outstanding balances match the capped deduction.
  const { total: cappedLoanTotal, updates: cappedUpdates } = loanDeductionForMonth(loans, month, result.loanDeduction);

  return prisma.$transaction(async (tx) => {
    const existing = payrollRunId
      ? await tx.payslip.findUnique({ where: { payrollRunId_employeeId: { payrollRunId, employeeId: employee.id } } })
      : await tx.payslip.findFirst({ where: { employeeId: employee.id, month } });
    if (existing) return { created: false, netSalary: existing.netSalary, loanApplied: cappedLoanTotal };

    try {
      const documentSnapshot: PayslipDocumentSnapshot = {
        version: 1, generatedAt: new Date().toISOString(), period: month,
        policy: { id: policySnapshot?.configurationId ?? null, version: policySnapshot?.configurationVersion ?? null, source: policySnapshot ? "configuration_record" : "tenant_config" },
        branding: { legalName: tenant?.profile?.legalName ?? tenant?.name ?? "Company", displayName: tenant?.profile?.displayName ?? tenant?.name ?? "Company", address: tenant?.profile?.address ?? tenant?.address ?? null, contact: tenant?.profile?.contactEmail ?? tenant?.profile?.contactPhone ?? tenant?.email ?? tenant?.phone ?? null, logoUrl: tenant?.profile?.logoUrl ?? null },
        employee: { name: `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(), employeeNumber: employee.employeeNumber ?? employee.id, designation: employee.position ?? null, department: employee.departmentName ?? null, joiningDate: employee.joiningDate?.toISOString() ?? null, bankName: employee.bankName ?? null, accountMasked: mask(employee.accountNumber), panMasked: mask(employee.pan), uan: employee.uan ?? null, esiIpNumber: employee.esiIpNumber ?? null },
        days: { payable: result.workingDays + result.onLeaveDays, paid: result.presentDays + result.lateDays + result.halfDays * 0.5 + result.paidLeaveDays, lop: result.absentDays + result.halfDays * 0.5 + result.unpaidLeaveDays },
        components: documentComponents(result), totals: { gross: result.grossEarnings, deductions: result.deductions, net: result.netSalary },
      };
      await tx.payslip.create({
        data: {
          tenantId,
          employeeId: employee.id,
          payrollRunId,
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
          absentDeduction: result.absentDeduction,
          workingDays: result.workingDays,
          divisorUsed: result.divisorUsed,
          onLeaveDays: result.onLeaveDays,
          deductions: result.deductions,
          adjustments: result.adjustments.length > 0 ? (result.adjustments as unknown as Prisma.InputJsonValue) : undefined,
          salaryBreakdown: result.salaryBreakdown.length > 0 ? (result.salaryBreakdown as unknown as Prisma.InputJsonValue) : undefined,
          presentDays: result.presentDays,
          lateDays: result.lateDays,
          halfDays: result.halfDays,
          absentDays: result.absentDays,
          overtimeHours: result.overtimeHours,
          workedHours: result.workedHours,
          netSalary: result.netSalary,
          payrollConfigurationId: policySnapshot?.configurationId,
          payrollConfigurationVersion: policySnapshot?.configurationVersion,
          payrollPolicyRules: policySnapshot?.appliedRules as unknown as Prisma.InputJsonValue | undefined,
          inputSnapshot: {
            version: 1,
            employee: { id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName, position: employee.position ?? null, joiningDate: employee.joiningDate ?? null, branchId: employee.branchId, branchName: employee.branchName ?? null, locationId: employee.locationId, departmentId: employee.departmentId, departmentName: employee.departmentName ?? null, pan: employee.pan ?? null, uan: employee.uan ?? null, esiIpNumber: employee.esiIpNumber ?? null, payMode: employee.payMode ?? "monthly", salary: employee.salary },
            statutory: { pfAllowed: employee.pfAllowed ?? null, esicAllowed: employee.esicAllowed ?? null, tdsAllowed: employee.tdsAllowed ?? null },
            // This private snapshot is never returned to employee/admin list UI;
            // it preserves the payment instruction selected at run generation.
            bank: { bankName: employee.bankName ?? null, accountNumber: employee.accountNumber ?? null, accountMasked: employee.accountNumber ? `****${employee.accountNumber.slice(-4)}` : null, ifscCode: employee.ifscCode ?? null },
            attendance: summary,
            policy: policySnapshot?.appliedRules ?? { source: "tenant_config", payrollConfig: config },
            result,
          } as unknown as Prisma.InputJsonValue,
          documentSnapshot: documentSnapshot as unknown as Prisma.InputJsonValue,
        },
      });
      if (payrollRunId) {
        const created = await tx.payslip.findUnique({ where: { payrollRunId_employeeId: { payrollRunId, employeeId: employee.id } }, select: { id: true, inputSnapshot: true } });
        if (created) await tx.payrollRunMember.create({ data: { payrollRunId, employeeId: employee.id, payslipId: created.id, inputSnapshot: created.inputSnapshot ?? {} } });
      }
    } catch (err: unknown) {
      // Concurrent double-run: second writer loses the race on the unique
      // (employeeId, month). Treat as "already exists" instead of 500.
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
        const dup = payrollRunId
          ? await tx.payslip.findUnique({ where: { payrollRunId_employeeId: { payrollRunId, employeeId: employee.id } } })
          : await tx.payslip.findFirst({ where: { employeeId: employee.id, month } });
        return { created: false, netSalary: dup?.netSalary, loanApplied: cappedLoanTotal };
      }
      throw err;
    }

    for (const u of cappedUpdates) {
      await tx.employeeLoan.update({
        where: { id: u.id },
        data: { outstanding: u.newOutstanding, lastDeductedMonth: u.lastDeductedMonth, status: u.close ? "closed" : "active" },
      });
    }

    return { created: true, netSalary: result.netSalary, loanApplied: cappedLoanTotal };
  });
}
