import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { enforceEbioEmployeeAccess } from "@/lib/ebioserver";
import { applyEmployeeStatusChange } from "@/lib/employee-status";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (status !== "active" && status !== "inactive") {
    return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
  }
  if (reason.length > 1_000) {
    return NextResponse.json({ error: "Reason must be 1,000 characters or fewer." }, { status: 400 });
  }
  if (session.sub === id && status === "inactive") {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  }
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: session.tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) },
    select: { id: true, firstName: true, lastName: true, role: true, status: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role === "location_manager" && ["admin", "branch_manager", "location_manager"].includes(employee.role)) {
    return NextResponse.json({ error: "Location managers cannot change privileged account status." }, { status: 403 });
  }
  if (status === "inactive" && employee.role === "admin") {
    const activeAdmins = await prisma.employee.count({ where: { tenantId: session.tenantId, role: "admin", status: "active" } });
    if (activeAdmins <= 1) return NextResponse.json({ error: "Cannot deactivate the last active admin." }, { status: 400 });
  }

  const result = await applyEmployeeStatusChange({
    employee,
    status,
    updateStatus: () => prisma.employee.update({ where: { id }, data: { status } }),
    enforceDeviceBlock: (employeeId) => enforceEbioEmployeeAccess(session.tenantId, employeeId, false),
  });
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: `employee.status.${status}`,
    entity: "Employee",
    entityId: id,
    summary: `${employee.firstName} ${employee.lastName} marked ${status}`,
    before: { status: employee.status },
    after: { status, reason: reason || null },
  });
  if (result.deviceResults.length) {
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: "employee.device_access.block",
      entity: "Employee",
      entityId: id,
      summary: `${employee.firstName} ${employee.lastName}: block sent to ${result.deviceResults.length} active eBio device(s)${result.deviceFailures.length ? `; ${result.deviceFailures.length} failed` : ""}`,
      after: { allowed: false, results: result.deviceResults },
    });
  }
  return NextResponse.json({ employee: result.employee, deviceResults: result.deviceResults, deviceFailures: result.deviceFailures }, { status: result.deviceFailures.length ? 207 : 200 });
}
