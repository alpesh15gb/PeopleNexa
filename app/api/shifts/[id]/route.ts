import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.shift.update({
    where: { id },
    data: {
      name: body.name ?? shift.name,
      code: body.code ?? shift.code,
      startTime: body.startTime ?? shift.startTime,
      endTime: body.endTime ?? shift.endTime,
      graceMinutes: body.graceMinutes != null ? Number(body.graceMinutes) : shift.graceMinutes,
      isNightShift: body.isNightShift != null ? Boolean(body.isNightShift) : shift.isNightShift,
    },
  });
  return NextResponse.json({ shift: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (shift.isDefault) {
    return NextResponse.json({ error: "The default shift cannot be deleted." }, { status: 400 });
  }
  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
