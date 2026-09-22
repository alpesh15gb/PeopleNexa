export const designationManagerRoles = new Set(["admin", "location_manager"]);

export function canManageDesignations(role: string | null | undefined) {
  return Boolean(role && designationManagerRoles.has(role));
}
