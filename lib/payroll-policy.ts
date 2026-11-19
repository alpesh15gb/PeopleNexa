import { payrollPolicyDraft, resolveConfiguration } from "./configuration";
import { getPayrollConfig, workspaceUsesShiftWeeklyOffs, type PayrollConfig } from "./payroll";

export function newWorkspacePayrollSettings() {
  return {
    requirePublishedPayrollPolicy: true,
    payrollUsesShiftWeeklyOffs: true,
    payroll: {
      lateFinePerLateDay: 0,
      pf: { enabled: false },
      esic: { enabled: false },
      pt: { enabled: false, state: "" },
      lwf: { enabled: false },
      tds: { enabled: false },
    },
  };
}

export function requiresPublishedPayrollPolicy(tenantConfig: unknown) {
  return Boolean(tenantConfig && typeof tenantConfig === "object" && "requirePublishedPayrollPolicy" in tenantConfig && tenantConfig.requirePublishedPayrollPolicy === true);
}

export function canUsePayrollPolicyFallback(tenantConfig: unknown, legacyAcknowledged: boolean) {
  return legacyAcknowledged && !requiresPublishedPayrollPolicy(tenantConfig);
}

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
    source: "location_override" | "tenant_policy" | "tenant_config";
    locationId: string | null;
    jurisdiction: string | null;
    profile: string;
    payrollConfig: PayrollConfig;
    useShiftWeeklyOffs: boolean;
  };
};

/** Resolves policy precedence for a payroll month without changing unsupported engine rules. */
export function resolvePayrollPolicy(records: PayrollPolicyRecord[], tenantConfig: unknown, locationId: string | null, month: string): PayrollPolicySnapshot {
  const legacy = getPayrollConfig(tenantConfig);
  const valid = records.filter((record) => payrollPolicyDraft(record.payload));
  // Use midday UTC for the payroll month's calendar date, avoiding IST midnight
  // conversion from placing the first day in the preceding UTC date.
  const date = new Date(`${month}-01T12:00:00.000Z`);
  const policy = resolveConfiguration(valid, locationId, date);
  const draft = policy && payrollPolicyDraft(policy.payload);
  const companyPolicy = policy?.locationId ? resolveConfiguration(valid, null, date) : null;
  const useShiftWeeklyOffs = draft?.attendanceTreatment.useShiftWeeklyOffs
    ?? payrollPolicyDraft(companyPolicy?.payload)?.attendanceTreatment.useShiftWeeklyOffs
    ?? workspaceUsesShiftWeeklyOffs(tenantConfig);
  if (!policy || !draft) {
    return { configurationId: null, configurationVersion: null, appliedRules: { source: "tenant_config", locationId, jurisdiction: legacy.pt.state || null, profile: "Tenant configuration fallback", payrollConfig: legacy, useShiftWeeklyOffs } };
  }

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
    monthlyDivisor: draft.monthlyDivisor,
    salaryDivisorMethod: draft.salaryDivisorMethod,
    earnedSalaryRounding: draft.earnedSalaryRounding,
    earnedSalaryAggregation: draft.earnedSalaryAggregation,
  };
  return { configurationId: policy.id, configurationVersion: policy.version, appliedRules: { source: policy.locationId ? "location_override" : "tenant_policy", locationId: policy.locationId, jurisdiction: payrollConfig.pt.state || null, profile: policy.locationId ? "Location payroll policy override" : "Tenant payroll policy", payrollConfig, useShiftWeeklyOffs } };
}

export function payrollConfigFromSnapshot(snapshot: unknown): PayrollConfig | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const config = (snapshot as { payrollConfig?: unknown }).payrollConfig;
  return config ? getPayrollConfig({ payroll: config }) : null;
}
