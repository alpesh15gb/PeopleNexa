import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AUTOMATIC_SHIFT_KIND, automaticShiftPolicy } from "@/lib/automatic-shifts";
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.branchIds) || !body.branchIds.length || body.branchIds.some((id: unknown) => typeof id !== "string" || !id) || typeof body.shiftId !== "string" || typeof body.overwrite !== "boolean" || typeof body.apply !== "boolean") return NextResponse.json({ error: "Select branches, a shift and an assignment mode." }, { status: 400 });
  const branchIds = [...new Set<string>(body.branchIds)];
  try {
    const result = await prisma.$transaction(async tx => {
      const branches = await tx.branch.findMany({ where: { tenantId: session.tenantId, id: { in: branchIds } }, select: { id: true, name: true } });
      const shift = await tx.shift.findFirst({ where: { tenantId: session.tenantId, id: body.shiftId }, select: { id: true, name: true } });
      if (branches.length !== branchIds.length || !shift) throw new Error("Branch or shift not found in this workspace.");
      const configs = await tx.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: AUTOMATIC_SHIFT_KIND, active: true, scopeKey: { in: branchIds.map(id => `branch:${id}`) } } });
      if (configs.some(config => automaticShiftPolicy(config.payload)?.enabled)) throw new Error("Exclude branches with enabled automatic rotational shifts from fixed assignment.");
      const employees = await tx.employee.findMany({ where: { tenantId: session.tenantId, branchId: { in: branchIds }, status: "active", loginOnly: false, ...(body.overwrite ? { OR: [{ shiftId: null }, { shiftId: { not: shift.id } }] } : { shiftId: null }) }, select: { id: true, employeeNumber: true, firstName: true, lastName: true, shiftId: true }, orderBy: { id: "asc" } });
      if (body.apply) {
        if (JSON.stringify(body.expectedEmployees) !== JSON.stringify(employees.map(e => ({ id: e.id, shiftId: e.shiftId })))) throw new Error("Employee assignments changed. Preview again.");
        await tx.employee.updateMany({ where: { tenantId: session.tenantId, id: { in: employees.map(e => e.id) } }, data: { shiftId: shift.id } });
        await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "employee.bulk_shift_assignment", entity: "Shift", entityId: shift.id, summary: `Assigned ${shift.name} to ${employees.length} employees`, before: { employees: employees.map(e => ({ id: e.id, shiftId: e.shiftId })) }, after: { branchIds, shiftId: shift.id, overwrite: body.overwrite } } });
      }
      return { count: employees.length, employees };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: (error as { code?: string }).code === "P2034" ? "Assignments changed. Preview again." : error instanceof Error ? error.message : "Assignment failed." }, { status: 409 }); }
}
