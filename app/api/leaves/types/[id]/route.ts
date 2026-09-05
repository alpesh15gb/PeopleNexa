import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const type = await prisma.leaveType.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.leaveType.update({
    where: { id },
    data: {
      name: body.name ?? type.name,
      maxDays: body.maxDays != null ? Number(body.maxDays) : type.maxDays,
      isCarryForward: body.isCarryForward != null ? Boolean(body.isCarryForward) : type.isCarryForward,
      requiresApproval: body.requiresApproval != null ? Boolean(body.requiresApproval) : type.requiresApproval,
      color: body.color ?? type.color,
    },
  });
  return NextResponse.json({ type: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const type = await prisma.leaveType.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.leaveType.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
