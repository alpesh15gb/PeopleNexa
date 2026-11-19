import type { Prisma } from "@/generated/prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { employeeLocationScope } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";

export function canOpenApprovals(role: string) {
  return role === "admin" || role === "location_manager" || role === "branch_manager" || role === "supervisor";
}

export type PendingApprovalFilters = {
  leave?: Prisma.LeaveRequestWhereInput;
  correction?: Prisma.PunchCorrectionWhereInput;
  expense?: Prisma.ExpenseClaimWhereInput;
  exit?: Prisma.ExitRequestWhereInput;
};

export async function pendingApprovalFilters(session: SessionPayload): Promise<PendingApprovalFilters> {
  const { tenantId, role, sub } = session;
  if (!canOpenApprovals(role)) return {};
  const actor = role === "location_manager" || role === "branch_manager"
    ? await prisma.employee.findFirst({
      where: { id: sub, tenantId, status: "active" },
      select: { branchId: true, locationId: true },
    })
    : null;
  if ((role === "location_manager" && !actor?.locationId) || (role === "branch_manager" && !actor?.branchId)) return {};

  const locationId = role === "location_manager" ? actor?.locationId : null;
  const branchId = role === "branch_manager" ? actor?.branchId : null;
  const employee: Prisma.EmployeeWhereInput = {
    tenantId,
    ...(locationId ? employeeLocationScope(locationId) : {}),
    ...(branchId ? { branchId } : {}),
  };
  const pending = { tenantId, status: "pending", employee };

  const correction: Prisma.PunchCorrectionWhereInput = {
    ...pending,
    employeeId: { not: sub },
    // Correction reviews use the employee's branch location in their handler.
    employee: locationId ? { tenantId, branch: { locationId } } : employee,
  };
  if (role === "supervisor") return { correction };

  const leave: Prisma.LeaveRequestWhereInput = {
    tenantId,
    employee,
    employeeId: { not: sub },
    AND: [
      { OR: [{ createdBy: null }, { createdBy: { not: sub } }] },
      { OR: [
        { status: "pending" },
        { status: "approved", cancellationRequestedBy: { not: null }, NOT: { cancellationRequestedBy: sub } },
      ] },
    ],
  };
  if (role === "branch_manager") return { correction, leave };

  return { correction, leave, expense: { ...pending, employeeId: { not: sub } }, exit: { ...pending, employeeId: { not: sub } } };
}
