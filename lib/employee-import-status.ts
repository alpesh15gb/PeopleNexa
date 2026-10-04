/** Blank CSV cells preserve existing status; new employees default to active. */
export function employeeImportStatus(value: unknown): "active" | "inactive" | undefined {
  const status = value == null ? "" : String(value).trim().toLowerCase();
  if (!status) return undefined;
  if (status !== "active" && status !== "inactive") throw new Error("Status must be active or inactive.");
  return status;
}

export function assertEmployeeImportStatusChange(actor: { sub: string; role: string }, employee: { id: string; role: string; status: string }, status: string | undefined) {
  if (!status || status === employee.status) return;
  if (actor.sub === employee.id && status === "inactive") throw new Error("You cannot deactivate your own account.");
  if (["admin", "branch_manager", "location_manager"].includes(employee.role)) {
    throw new Error("Change privileged account status from Employee Master, rather than an upload.");
  }
}
