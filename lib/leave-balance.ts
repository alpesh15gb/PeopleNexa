export type LeaveBalanceInput = { cap: number | null; opening: number; credited: number; used: number; pending: number };
export type LeaveBalanceSource = "policy_period" | "imported_snapshot" | "leave_type_allowance" | "unlimited_leave_type";

/** A null cap is intentionally unlimited; numeric legacy values remain caps. */
export function calculateLeaveBalance({ cap, opening, credited, used, pending }: LeaveBalanceInput) {
  return { available: cap === null ? null : Math.max(cap + opening + credited - used - pending, 0), committed: used + pending };
}

export function leaveBalanceScope(role: string, manager: { locationId: string | null } | null) {
  if (role === "admin") return {};
  if (role === "location_manager" && manager?.locationId) return { branch: { locationId: manager.locationId } };
  return null;
}

export function leaveBalanceSource(hasPolicyPeriod: boolean, hasImportedSnapshot: boolean, cap: number | null): LeaveBalanceSource {
  if (hasPolicyPeriod) return "policy_period";
  if (hasImportedSnapshot) return "imported_snapshot";
  return cap === null ? "unlimited_leave_type" : "leave_type_allowance";
}

export function isEarnedLeave(code: string, name: string) {
  return code.trim().toUpperCase() === "EL" || /\bearned\s+leave\b/i.test(name);
}
