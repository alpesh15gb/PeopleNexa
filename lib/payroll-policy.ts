import { payrollPolicyDraft, resolveConfiguration } from "./configuration";
import { getPayrollConfig, type PayrollConfig } from "./payroll";

type PayrollPolicyRecord = {
  id: string;
  locationId: string | null;
  version: number;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  payload: unknown;
};

export type PayrollPolicySnapshot = {
  configurationId: string | null;
  configurationVersion: number | null;
  appliedRules: {
    source: "payroll_policy" | "tenant_config";
    payrollConfig: PayrollConfig;
  };
};

/** Resolves policy precedence for a payroll month without changing unsupported engine rules. */
export function resolvePayrollPolicy(records: PayrollPolicyRecord[], tenantConfig: unknown, locationId: string | null, month: string): PayrollPolicySnapshot {
  const legacy = getPayrollConfig(tenantConfig);
  const valid = records.filter((record) => payrollPolicyDraft(record.payload));
  // Use midday UTC for the payroll month's calendar date, avoiding IST midnight
  // conversion from placing the first day in the preceding UTC date.
  const policy = resolveConfiguration(valid, locationId, new Date(`${month}-01T12:00:00.000Z`));
  const draft = policy && payrollPolicyDraft(policy.payload);
  if (!policy || !draft) {
    return { configurationId: null, configurationVersion: null, appliedRules: { source: "tenant_config", payrollConfig: legacy } };
  }

  // The engine deliberately keeps its fixed monthly divisor and pay-mode OT
  // basis. Only rules represented by PayrollConfig are activated here.
  const payrollConfig: PayrollConfig = {
    ...legacy,
    otMultiplier: draft.overtimeMultiplier,
    deductAbsentDays: draft.deductLossOfPay,
    pf: { enabled: draft.statutory.pfEnabled, wageCeiling: draft.statutory.pfWageCeiling },
    esic: { enabled: draft.statutory.esicEnabled, grossCeiling: draft.statutory.esicGrossCeiling },
    pt: { enabled: draft.statutory.professionalTaxEnabled, state: draft.statutory.professionalTaxState },
    lwf: { enabled: draft.statutory.labourWelfareFundEnabled },
    tds: { enabled: draft.statutory.tdsEnabled, regime: draft.statutory.tdsRegime },
    components: draft.components,
  };
  return { configurationId: policy.id, configurationVersion: policy.version, appliedRules: { source: "payroll_policy", payrollConfig } };
}

export function payrollConfigFromSnapshot(snapshot: unknown): PayrollConfig | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const config = (snapshot as { payrollConfig?: unknown }).payrollConfig;
  return config ? getPayrollConfig({ payroll: config }) : null;
}
