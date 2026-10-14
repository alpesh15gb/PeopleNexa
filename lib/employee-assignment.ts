export function isAssignmentPending(employee: { branch?: unknown; branchId?: string | null; email?: string | null; legacyImportData?: unknown }) {
  const source = employee.legacyImportData as { source?: string; assignmentPending?: boolean } | null;
  return !employee.branch && !employee.branchId && (source?.source === "ebioserver" || employee.email?.endsWith("@device.local") === true);
}

export const assignmentPendingWhere = {
  branchId: null,
  OR: [
    { legacyImportData: { path: ["source"], equals: "ebioserver" } },
    { email: { endsWith: "@device.local" } },
  ],
};
