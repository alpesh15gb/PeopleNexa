import {
  payrollPolicyDraft,
  resolveConfiguration,
  type PayrollComponentRule,
  type PayrollPolicyDraft,
  type PayrollSchedule,
  type PayrollStatutoryRule,
} from "./configuration";
import type { PayrollConfig } from "./payroll";

export type PayrollPolicyEditorRecord = {
  id: string;
  locationId: string | null;
  version: number;
  active: boolean;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  payload: unknown;
};

export type PayrollComponentBandEditor = {
  minCtc: number;
  maxCtc: number | null;
  amount: number;
} & Record<string, unknown>;

export type PayrollComponentEditor = Omit<PayrollComponentRule, "bands"> & {
  bands?: PayrollComponentBandEditor[];
} & Record<string, unknown>;

export type PayrollStatutoryRuleEditor = PayrollStatutoryRule & Record<string, unknown>;

export type PayrollPolicyEditorDraft = Omit<PayrollPolicyDraft, "components" | "schedule" | "statutoryRules" | "statutory"> & {
  statutory: PayrollPolicyDraft["statutory"] & Record<string, unknown>;
  components: PayrollComponentEditor[];
  schedule: PayrollSchedule & Record<string, unknown>;
  statutoryRules: PayrollStatutoryRuleEditor[];
} & Record<string, unknown>;

export type PayrollPolicyEditorSource = {
  record: PayrollPolicyEditorRecord | null;
  kind: "location_override" | "tenant_fallback" | "tenant_template" | "tenant_config_baseline";
};

const DEFAULT_SCHEDULE: PayrollSchedule = {
  frequency: "monthly",
  payDateRule: "last_day",
  attendanceCutoffDay: null,
  adjustmentCutoffDay: null,
  reimbursementCutoffDay: null,
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function payrollPolicyEditorBaseline(config: PayrollConfig): PayrollPolicyEditorDraft {
  return {
    monthlyDivisor: config.monthlyDivisor ?? 26,
    salaryDivisorMethod: config.salaryDivisorMethod,
    earnedSalaryRounding: config.earnedSalaryRounding,
    earnedSalaryAggregation: config.earnedSalaryAggregation,
    deductLossOfPay: config.deductAbsentDays,
    overtimeMultiplier: config.otMultiplier,
    overtimeBasis: "basic_hourly",
    statutory: {
      pfEnabled: config.pf.enabled,
      pfWageCeiling: config.pf.wageCeiling,
      esicEnabled: config.esic.enabled,
      esicGrossCeiling: config.esic.grossCeiling,
      professionalTaxEnabled: config.pt.enabled,
      professionalTaxState: config.pt.state,
      labourWelfareFundEnabled: config.lwf.enabled,
      tdsEnabled: config.tds.enabled,
      tdsRegime: config.tds.regime,
    },
    components: clone(config.components ?? []) as PayrollComponentEditor[],
    schedule: clone(DEFAULT_SCHEDULE),
    statutoryRules: [],
  };
}

/**
 * Builds an editable clone without discarding payload keys introduced by other
 * supported producers. Known values are normalized, while unknown keys remain.
 */
export function payrollPolicyEditorDraft(payload: unknown, baseline: PayrollPolicyEditorDraft): PayrollPolicyEditorDraft {
  const parsed = payrollPolicyDraft(payload);
  if (!parsed) return clone(baseline);

  const raw = clone(object(payload));
  const rawComponents = Array.isArray(raw.components) ? raw.components : [];
  const components = (parsed.components ?? []).map((component, index) => {
    const rawComponent = object(rawComponents[index]);
    const rawBands = Array.isArray(rawComponent.bands) ? rawComponent.bands : [];
    const bands = component.bands?.map((band, bandIndex) => ({ ...object(rawBands[bandIndex]), ...band }));
    return { ...rawComponent, ...component, ...(bands ? { bands } : {}) } as PayrollComponentEditor;
  });
  const rawSchedule = object(raw.schedule);
  const schedule = parsed.schedule ? { ...rawSchedule, ...parsed.schedule } : clone(baseline.schedule);
  const rawRules = Array.isArray(raw.statutoryRules) ? raw.statutoryRules : [];
  const statutoryRules = (parsed.statutoryRules ?? []).map((rule, index) => ({ ...object(rawRules[index]), ...rule })) as PayrollStatutoryRuleEditor[];

  return {
    ...raw,
    ...parsed,
    statutory: { ...object(raw.statutory), ...parsed.statutory },
    components,
    schedule,
    statutoryRules,
  } as PayrollPolicyEditorDraft;
}

export function resolvePayrollPolicyEditorSource(
  records: PayrollPolicyEditorRecord[],
  locationId: string | null,
  effectiveDate: string,
): PayrollPolicyEditorSource {
  const valid = records
    .filter((record) => payrollPolicyDraft(record.payload))
    .map((record) => ({
      ...record,
      effectiveFrom: new Date(record.effectiveFrom),
      effectiveTo: record.effectiveTo ? new Date(record.effectiveTo) : null,
    }));
  const at = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    ? new Date(`${effectiveDate}T12:00:00.000Z`)
    : new Date();
  const record = resolveConfiguration(valid, locationId, at);
  if (!record) return { record: null, kind: "tenant_config_baseline" };
  const original = records.find((candidate) => candidate.id === record.id) ?? record;
  if (locationId === null) return { record: original, kind: "tenant_template" };
  return { record: original, kind: record.locationId === locationId ? "location_override" : "tenant_fallback" };
}

export function payrollScheduleExample(monthlySalary: number, lopDays: number, divisor: number, deductLossOfPay: boolean, rounding: PayrollPolicyDraft["earnedSalaryRounding"] = "two_decimals") {
  const round = (amount: number) => rounding === "floor_rupee" ? Math.floor(amount + 1e-9) : rounding === "nearest_rupee" ? Math.round(amount) : Math.round(amount * 100) / 100;
  const salaryAfterLop = deductLossOfPay && divisor > 0 ? round(monthlySalary * Math.max(0, divisor - lopDays) / divisor) : monthlySalary;
  const deduction = Math.round(Math.max(0, monthlySalary - salaryAfterLop) * 100) / 100;
  return {
    deduction,
    salaryAfterLop,
  };
}
