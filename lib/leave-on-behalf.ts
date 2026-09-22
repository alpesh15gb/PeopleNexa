export type LeaveActorRole = "admin" | "location_manager" | "branch_manager" | string;

/** Keeps delegated leave access constrained even when the UI is bypassed. */
export function canApplyLeaveOnBehalf(
  role: LeaveActorRole,
  actor: { branchId: string | null; locationId: string | null },
  target: { branchId: string | null; locationId: string | null },
) {
  if (role === "admin") return true;
  if (role === "location_manager") return Boolean(actor.locationId && target.locationId === actor.locationId);
  if (role === "branch_manager") return Boolean(actor.branchId && target.branchId === actor.branchId);
  return false;
}

export function leaveSubmissionAttribution(actorId: string, employeeId: string) {
  const onBehalf = actorId !== employeeId;
  return { createdBy: actorId, source: onBehalf ? "admin_on_behalf" : "self_service", onBehalf } as const;
}
