import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — mark a task done (employee or admin) or reopen it. DELETE — admin only. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const task = await prisma.onboardingTask.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, employeeId: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (session.role !== "admin" && task.employeeId !== session.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const done = body.status === "done";
  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: done ? { status: "done", completedAt: new Date() } : { status: "pending", completedAt: null },
  });
  return NextResponse.json({ task: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const task = await prisma.onboardingTask.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await prisma.onboardingTask.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
