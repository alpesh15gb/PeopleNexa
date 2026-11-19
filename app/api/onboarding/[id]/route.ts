import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

/** PATCH — mark a task done (employee or admin) or reopen it. DELETE — admin only. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const locationId = await managerLocationId(session);

  const status = body?.status;
  if (status !== "pending" && status !== "done") {
    return NextResponse.json({ error: "Invalid status. Must be pending or done." }, { status: 400 });
  }
  const where = {
    id,
    tenantId: session.tenantId,
    employee: { status: "active", loginOnly: false },
    ...(locationId ? { OR: [{ employeeId: session.sub }, { employee: employeeLocationScope(locationId) }] } : session.role !== "admin" ? { employeeId: session.sub } : {}),
  };
  const [changed] = await prisma.onboardingTask.updateManyAndReturn({
    where: { ...where, status: { not: status } },
    data: { status, completedAt: status === "done" ? new Date() : null },
  });
  const updated = changed ?? await prisma.onboardingTask.findFirst({ where });
  if (!updated) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const deleted = await prisma.onboardingTask.deleteMany({
    where: { id, tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) },
  });
  if (!deleted.count) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
