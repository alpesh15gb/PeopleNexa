export type LeaveBalanceInput = { cap: number | null; opening: number; credited: number; used: number; pending: number; unlimitedEntitlement?: boolean };
export type LeaveBalanceSource = "policy_period" | "imported_snapshot" | "leave_type_allowance" | "unlimited_leave_type";

/** A null cap removes the annual ceiling; it never grants a balance on its own. */
export function calculateLeaveBalance({ cap, opening, credited, used, pending, unlimitedEntitlement = false }: LeaveBalanceInput) {
  return { available: unlimitedEntitlement ? null : Math.max((cap ?? 0) + opening + credited - used - pending, 0), committed: used + pending };
}

export function canClaimLeave(balance: number | null, days: number) {
  return balance === null || days <= balance;
}

export function leaveBalanceScope(role: string, manager: { locationId: string | null } | null) {
  if (role === "admin") return {};
  if (role === "location_manager" && manager?.locationId) return { branch: { locationId: manager.locationId } };
  return null;
}

export function leaveBalanceSource(hasPolicyPeriod: boolean, hasImportedSnapshot: boolean, unlimitedEntitlement = false): LeaveBalanceSource {
  if (hasPolicyPeriod) return "policy_period";
  if (hasImportedSnapshot) return "imported_snapshot";
  return unlimitedEntitlement ? "unlimited_leave_type" : "leave_type_allowance";
}

export function policyHasUnlimitedEntitlement(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const rules = (snapshot as Record<string, unknown>).rules;
  return Boolean(rules && typeof rules === "object" && !Array.isArray(rules) && (rules as Record<string, unknown>).unlimitedEntitlement === true);
}

export function isEarnedLeave(code: string, name: string) {
  return code.trim().toUpperCase() === "EL" || /\bearned\s+leave\b/i.test(name);
}
