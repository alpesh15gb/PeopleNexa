import { NextRequest, NextResponse } from "next/server";
import { validateTransferDestination } from "@/lib/employee-transfer";
import { istDateKey } from "@/lib/ist";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "No location assigned." }, { status: 403 });
  const [{ id }, body] = await Promise.all([params, request.json().catch(() => null)]);
  const action = body?.action;
  if (action !== "cancel" && action !== "complete") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const tenantId = session.tenantId;
  const targetStatus = action === "complete" ? "completed" : "cancelled";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const where = { id, tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) };
      const transfer = await tx.employeeTransfer.findFirst({ where, include: {
        employee: { select: { id: true, branchId: true, departmentId: true, shiftId: true, managerId: true, status: true, loginOnly: true, role: true } },
      } });
      if (!transfer) return { error: "Transfer not found.", status: 404 } as const;
      if (transfer.status === targetStatus) {
        const { employee: _employee, ...record } = transfer;
        return { transfer: record } as const;
      }
      if (transfer.status !== "scheduled") return { error: "This transfer has already been resolved.", status: 409 } as const;

      const now = new Date();
      if (action === "complete") {
        const employee = transfer.employee;
        if (employee.status !== "active" || employee.loginOnly) return { error: "Transfer completion requires an active staff employee.", status: 409 } as const;
        if (locationId && ["admin", "branch_manager", "location_manager"].includes(employee.role)) return { error: "Only workspace administrators can transfer manager accounts.", status: 403 } as const;
        if (employee.branchId !== transfer.sourceBranchId || employee.departmentId !== transfer.sourceDepartmentId || employee.shiftId !== transfer.sourceShiftId || employee.managerId !== transfer.sourceManagerId) {
          return { error: "The employee's assignment changed. Cancel the transfer and create a new one.", status: 409 } as const;
        }
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { config: true } });
        if (dateKeyInTimeZone(now, workspaceRegion(tenant.config).timeZone) < istDateKey(transfer.effectiveDate)) {
          return { error: "Complete this transfer on or after its effective date.", status: 400 } as const;
        }
        const openExit = await tx.exitRequest.findFirst({ where: { tenantId, employeeId: employee.id, status: { in: ["pending", "approved"] } }, select: { id: true } });
        if (openExit) return { error: "Resolve the employee's open exit request before completing the transfer.", status: 409 } as const;

        const destination = await validateTransferDestination(tx, {
          employeeId: employee.id, tenantId, managerLocationId: locationId,
          branchId: transfer.destinationBranchId,
          departmentId: transfer.destinationDepartmentId,
          shiftId: transfer.destinationShiftId,
          managerId: transfer.destinationManagerId,
        });
        if ("error" in destination) return { error: destination.error, status: 409 } as const;
        await tx.employee.update({ where: { id: employee.id, tenantId }, data: {
          branchId: destination.branch.id,
          locationId: destination.branch.locationId,
          departmentId: transfer.destinationDepartmentId,
          shiftId: transfer.destinationShiftId,
          managerId: transfer.destinationManagerId,
          ...(transfer.destinationPosition ? { position: transfer.destinationPosition } : {}),
        } });
      }

      const updated = await tx.employeeTransfer.update({ where: { id, tenantId }, data: action === "complete"
        ? { status: targetStatus, completedBy: session.sub, completedAt: now }
        : { status: targetStatus, cancelledBy: session.sub, cancelledAt: now } });
      await tx.auditLog.create({ data: {
        tenantId, actorId: session.sub, actorRole: session.role, action: `transfer.${action}`, entity: "EmployeeTransfer", entityId: id,
        summary: action === "complete" ? "Completed employee transfer" : "Cancelled employee transfer",
        before: { status: "scheduled", branchId: transfer.sourceBranchId }, after: { status: targetStatus, branchId: action === "complete" ? transfer.destinationBranchId : transfer.sourceBranchId },
      } });
      return { transfer: updated } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ transfer: result.transfer });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") return NextResponse.json({ error: "Employee assignments changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
