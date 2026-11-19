import { NextRequest, NextResponse } from "next/server";
import { isDateKey } from "@/lib/dates";
import { validateTransferDestination } from "@/lib/employee-transfer";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "No location assigned." }, { status: 403 });
  const transfers = await prisma.employeeTransfer.findMany({
    where: { tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ transfers });
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "No location assigned." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const employeeId = String(body?.employeeId ?? "").trim();
  const branchId = String(body?.destinationBranchId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const note = String(body?.note ?? "").trim() || null;
  const position = String(body?.destinationPosition ?? "").trim();
  const date = String(body?.effectiveDate ?? "");
  if (!employeeId || !branchId || !reason || !isDateKey(date)) {
    return NextResponse.json({ error: "Employee, destination branch, reason and a valid effective date are required." }, { status: 400 });
  }
  if (reason.length > 2000 || (note?.length ?? 0) > 2000 || position.length > 100) {
    return NextResponse.json({ error: "Use up to 2,000 characters for the reason and note, and 100 for the position." }, { status: 400 });
  }
  const tenantId = session.tenantId;
  const effectiveDate = new Date(`${date}T00:00:00Z`);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) },
        select: { id: true, branchId: true, departmentId: true, shiftId: true, managerId: true, loginOnly: true, status: true, role: true },
      });
      if (!employee) return { error: "Employee was not found in your scope.", status: 404 } as const;
      if (employee.loginOnly || employee.status !== "active") return { error: "Select an active staff employee for transfer.", status: 400 } as const;
      if (locationId && ["admin", "branch_manager", "location_manager"].includes(employee.role)) return { error: "Only workspace administrators can transfer manager accounts.", status: 403 } as const;
      if (employee.branchId === branchId) return { error: "Employee is already assigned to this branch.", status: 400 } as const;

      const departmentId = String(body.destinationDepartmentId ?? "").trim() || employee.departmentId;
      const shiftId = String(body.destinationShiftId ?? "").trim() || employee.shiftId;
      const managerId = String(body.destinationManagerId ?? "").trim() || employee.managerId;
      const destination = await validateTransferDestination(tx, { employeeId, tenantId, managerLocationId: locationId, branchId, departmentId, shiftId, managerId });
      if (destination.error) return { error: destination.error, status: destination.status } as const;

      const [openExit, existing] = await Promise.all([
        tx.exitRequest.findFirst({ where: { tenantId, employeeId, status: { in: ["pending", "approved"] } }, select: { id: true } }),
        tx.employeeTransfer.findFirst({ where: { tenantId, employeeId, status: "scheduled" }, select: { id: true } }),
      ]);
      if (openExit) return { error: "Resolve the employee's open exit request before scheduling a transfer.", status: 409 } as const;
      if (existing) return { error: "This employee already has a scheduled transfer.", status: 409 } as const;

      const transfer = await tx.employeeTransfer.create({ data: {
        tenantId, employeeId,
        sourceBranchId: employee.branchId,
        sourceDepartmentId: employee.departmentId,
        sourceShiftId: employee.shiftId,
        sourceManagerId: employee.managerId,
        destinationBranchId: branchId,
        destinationDepartmentId: departmentId,
        destinationShiftId: shiftId,
        destinationManagerId: managerId,
        destinationPosition: position || null,
        effectiveDate, reason, note, requestedBy: session.sub,
      } });
      await tx.auditLog.create({ data: {
        tenantId, actorId: session.sub, actorRole: session.role, action: "transfer.schedule", entity: "EmployeeTransfer", entityId: transfer.id,
        summary: "Scheduled employee transfer", after: { employeeId, sourceBranchId: employee.branchId, destinationBranchId: branchId, effectiveDate: date },
      } });
      return { transfer } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ transfer: result.transfer }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") return NextResponse.json({ error: "Employee assignments changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
