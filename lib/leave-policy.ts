import { leavePolicyDraft, resolveConfiguration } from "@/lib/configuration";

type LeavePolicyRecord = {
  id: string;
  locationId: string | null;
  version: number;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  payload: unknown;
};

export type LeavePolicySnapshot = {
  configurationId: string;
  version: number;
  scope: "tenant" | "location";
  rules: {
    name: string;
    code: string;
    annualEntitlement: number;
    paid: boolean;
    allowsHalfDay: boolean;
    requiresApproval: boolean;
  };
};

export function resolveLeavePolicy(records: LeavePolicyRecord[], locationId: string | null, at: Date, leaveTypeCode: string): LeavePolicySnapshot | null {
  const validRecords = records.filter((record) => leavePolicyDraft(record.payload));
  const record = resolveConfiguration(validRecords, locationId, at);
  if (!record) return null;

  const rules = leavePolicyDraft(record.payload)!.leaveTypes.find((type) => type.code === leaveTypeCode.trim().toUpperCase());
  if (!rules) return null;
  return {
    configurationId: record.id,
    version: record.version,
    scope: record.locationId ? "location" : "tenant",
    rules: {
      name: rules.name,
      code: rules.code,
      annualEntitlement: rules.annualEntitlement,
      paid: rules.paid,
      allowsHalfDay: rules.allowsHalfDay,
      requiresApproval: rules.requiresApproval,
    },
  };
}

export function leaveRequestEntitlement(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const rules = (snapshot as Record<string, unknown>).rules;
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const entitlement = (rules as Record<string, unknown>).annualEntitlement;
  return typeof entitlement === "number" && Number.isInteger(entitlement) && entitlement >= 0 && entitlement <= 366 ? entitlement : null;
}
