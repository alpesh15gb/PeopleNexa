import type { Prisma } from "@/generated/prisma/client";
import { reportingManagerCreatesCycle } from "@/lib/employee-reporting-line";
import { employeeLocationScope } from "@/lib/location-scope";

export async function validateTransferDestination(tx: Prisma.TransactionClient, {
  employeeId, tenantId, managerLocationId, branchId, departmentId, shiftId, managerId,
}: {
  employeeId: string;
  tenantId: string;
  managerLocationId: string | null;
  branchId: string;
  departmentId: string | null;
  shiftId: string | null;
  managerId: string | null;
}) {
  const [branch, department, shift, manager] = await Promise.all([
    tx.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true, locationId: true } }),
    departmentId ? tx.department.findFirst({ where: { id: departmentId, tenantId }, select: { id: true } }) : null,
    shiftId ? tx.shift.findFirst({ where: { id: shiftId, tenantId }, select: { id: true } }) : null,
    managerId ? tx.employee.findFirst({
      where: { id: managerId, tenantId, status: "active", loginOnly: false, ...(managerLocationId ? employeeLocationScope(managerLocationId) : {}) },
      select: { id: true },
    }) : null,
  ]);
  if (!branch) return { error: "Destination branch was not found in this workspace.", status: 404 } as const;
  if (managerLocationId && branch.locationId !== managerLocationId) return { error: "Destination branch must belong to your assigned location.", status: 403 } as const;
  if (departmentId && !department) return { error: "Destination department was not found in this workspace.", status: 400 } as const;
  if (shiftId && !shift) return { error: "Destination shift was not found in this workspace.", status: 400 } as const;
  if (managerId && !manager) return { error: "Choose an active reporting manager in your scope.", status: 400 } as const;
  if (managerId && await reportingManagerCreatesCycle(tx, tenantId, employeeId, managerId)) {
    return { error: "This transfer would create a reporting cycle.", status: 400 } as const;
  }
  return { branch } as const;
}
