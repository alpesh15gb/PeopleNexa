import type { Prisma } from "@/generated/prisma/client";

/** Shared by the on-screen report and export so filters and manager scopes agree. */
export function inactiveEmployeeReportWhere({ tenantId, role, manager, branchId, departmentId, query }: {
  tenantId: string; role: string; manager?: { branchId: string | null; locationId: string | null } | null;
  branchId?: string; departmentId?: string; query?: string;
}): Prisma.EmployeeWhereInput {
  const AND: Prisma.EmployeeWhereInput[] = [];
  if (role === "branch_manager") AND.push(manager?.branchId ? { branchId: manager.branchId } : { id: { in: [] } });
  if (role === "location_manager") AND.push(manager?.locationId ? { branch: { locationId: manager.locationId } } : { id: { in: [] } });
  if (branchId) AND.push({ branchId });
  if (departmentId) AND.push({ departmentId });
  for (const term of query?.trim().split(/\s+/).filter(Boolean) ?? []) {
    AND.push({ OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { employeeNumber: { contains: term, mode: "insensitive" } },
      { deviceCode: { contains: term, mode: "insensitive" } },
    ] });
  }
  return { tenantId, loginOnly: false, status: "inactive", AND };
}

export const inactiveEmployeeReportSelect = {
  id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true,
  branch: { select: { name: true } }, department: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;
