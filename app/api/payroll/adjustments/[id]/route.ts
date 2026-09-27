import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

/** DELETE — remove a manual adjustment (admin). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const adjustment = await prisma.payrollAdjustment.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) }, include: { employee: { select: { locationId: true, branch: { select: { locationId: true } } } } } });
  if (!adjustment) return NextResponse.json({ error: "Adjustment not found." }, { status: 404 });
  const employeeLocationId = adjustment.employee.branch?.locationId ?? adjustment.employee.locationId;
  const run = await prisma.payrollRun.findFirst({ where: { tenantId: session.tenantId, month: adjustment.month, ...(employeeLocationId ? { locationId: employeeLocationId } : {}), status: { not: "draft" } }, select: { status: true } });
  if (run) return NextResponse.json({ error: `Adjustments cannot change a ${run.status} payroll run.` }, { status: 409 });
  await prisma.payrollAdjustment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
