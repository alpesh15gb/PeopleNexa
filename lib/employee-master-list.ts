import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assignmentPendingWhere } from "@/lib/employee-assignment";

export type MasterStatus = "all" | "active" | "inactive" | "assignment_pending";
function pendingWhere(baseWhere: Prisma.EmployeeWhereInput): Prisma.EmployeeWhereInput {
  const constraints = baseWhere.AND ? Array.isArray(baseWhere.AND) ? baseWhere.AND : [baseWhere.AND] : [];
  return { ...baseWhere, AND: [...constraints, assignmentPendingWhere] };
}
export function masterStatusWhere(baseWhere: Prisma.EmployeeWhereInput, status: MasterStatus): Prisma.EmployeeWhereInput {
  return status === "assignment_pending" ? pendingWhere(baseWhere) : { ...baseWhere, ...(status !== "all" ? { status } : {}) };
}

/** List navigation never loads full HR imports, profile images or editor option lists. */
export async function loadEmployeeMasterList(baseWhere: Prisma.EmployeeWhereInput, status: MasterStatus, page: number) {
  const where = masterStatusWhere(baseWhere, status);
  const [groups, pendingCount, rows] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.employee.count({ where: pendingWhere(baseWhere) }),
    prisma.employee.findMany({
      where,
      select: { id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, status: true, role: true, branchId: true, branch: { select: { name: true } } },
      orderBy: [{ employeeNumber: "asc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50,
    }),
  ]);
  const counts = {
    all: groups.reduce((sum, group) => sum + group._count._all, 0),
    active: groups.find(group => group.status === "active")?._count._all ?? 0,
    inactive: groups.find(group => group.status === "inactive")?._count._all ?? 0,
    assignment_pending: pendingCount,
  };
  const unassignedIds = rows.filter(row => !row.branchId).map(row => row.id);
  const pending = status === "assignment_pending" ? rows : unassignedIds.length ? await prisma.employee.findMany({ where: { ...pendingWhere(baseWhere), id: { in: unassignedIds } }, select: { id: true } }) : [];
  const pendingIds = new Set(pending.map(row => row.id));
  return { employees: rows.map(({ branchId: _branchId, ...row }) => ({ ...row, assignmentPending: pendingIds.has(row.id) })), counts, total: counts[status], where };
}
