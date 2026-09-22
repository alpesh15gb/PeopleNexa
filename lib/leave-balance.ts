export type LeaveBalanceInput = { cap: number | null; opening: number; credited: number; used: number; pending: number };

/** A null cap is intentionally unlimited; numeric legacy values remain caps. */
export function calculateLeaveBalance({ cap, opening, credited, used, pending }: LeaveBalanceInput) {
  return { available: cap === null ? null : Math.max(cap + opening + credited - used - pending, 0), committed: used + pending };
}

export function leaveBalanceScope(role: string, manager: { locationId: string | null } | null) {
  if (role === "admin") return {};
  if (role === "location_manager" && manager?.locationId) return { branch: { locationId: manager.locationId } };
  return null;
}
