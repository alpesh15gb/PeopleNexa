import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { enforceEbioEmployeeAccess } from "@/lib/ebioserver";
import { applyEmployeeStatusChange } from "@/lib/employee-status";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const employeeFields = { id: true, firstName: true, lastName: true, role: true, status: true } as const;
const managerRoles = ["admin", "branch_manager", "location_manager"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [{ id }, body, locationId] = await Promise.all([ctx.params, req.json().catch(() => null), managerLocationId(session)]);
  const status = body?.status;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (status !== "active" && status !== "inactive") return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
  if (reason.length > 1_000) return NextResponse.json({ error: "Reason must be 1,000 characters or fewer." }, { status: 400 });
  if (session.sub === id && status === "inactive") return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "No location assigned." }, { status: 403 });
  const tenantId = session.tenantId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const where = { id, tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) };
      const previous = await tx.employee.findFirst({ where, select: employeeFields });
      if (!previous) return { error: "Employee not found.", status: 404 } as const;
      if (locationId && managerRoles.includes(previous.role)) return { error: "Location managers cannot change privileged account status.", status: 403 } as const;
      if (body?.bulkSelection === true && managerRoles.includes(previous.role)) return { error: "Use individual status controls for privileged accounts.", status: 400 } as const;
      if (previous.status === status) return { unchanged: true, employee: previous } as const;
      if (status === "inactive" && previous.role === "admin") {
        const otherAdmins = await tx.employee.count({ where: { tenantId, id: { not: id }, role: "admin", status: "active" } });
        if (!otherAdmins) return { error: "Keep at least one active workspace administrator.", status: 400 } as const;
      }
      const employee = await tx.employee.update({ where, data: { status, sessionVersion: { increment: 1 } }, select: employeeFields });
      await tx.auditLog.create({ data: {
        tenantId, actorId: session.sub, actorRole: session.role, action: `employee.status.${status}`, entity: "Employee", entityId: id,
        summary: "Changed employee status", before: { status: previous.status }, after: { status, reason: reason || null },
      } });
      return { previous, employee } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.unchanged) return NextResponse.json({ unchanged: true, employee: result.employee, deviceResults: [], deviceFailures: [] });

    const device = await applyEmployeeStatusChange({
      employee: result.previous,
      status,
      updateStatus: async () => result.employee,
      enforceDeviceBlock: (employeeId) => enforceEbioEmployeeAccess(tenantId, employeeId, false),
    }).catch(() => null);
    if (!device || device.deviceResults.length) await appendAudit({
      tenantId, actorId: session.sub, actorRole: session.role, action: "employee.device_access.block", entity: "Employee", entityId: id,
      summary: device ? `Submitted ${device.deviceResults.length} device blocks` : "Could not submit device blocks",
      after: { allowed: false, results: device?.deviceResults ?? null },
    });
    const deviceWarning = !device || device.deviceFailures.length > 0 ? "Review failed or pending biometric blocks in Device access." : null;
    return NextResponse.json({ employee: result.employee, deviceResults: device?.deviceResults ?? [], deviceFailures: device?.deviceFailures ?? [], deviceWarning }, { status: deviceWarning ? 207 : 200 });
  } catch (error) {
    if (["P2025", "P2034"].includes((error as { code?: string })?.code ?? "")) return NextResponse.json({ error: "Employee status changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
