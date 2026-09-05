import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const shift = await prisma.shift.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const name = String(body.name ?? shift.name).trim();
    if (!name) {
      return NextResponse.json({ error: "Name, start time and end time are required." }, { status: 400 });
    }
    const startTime = String(body.startTime ?? shift.startTime);
    const endTime = String(body.endTime ?? shift.endTime);
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(startTime) || !timeRe.test(endTime)) {
      return NextResponse.json({ error: "Start/end time must use HH:MM (24h)." }, { status: 400 });
    }
    if (startTime === endTime) {
      return NextResponse.json({ error: "Start and end time must be different." }, { status: 400 });
    }
    const exists = await prisma.shift.findFirst({
      where: { tenantId: session.tenantId, name, id: { not: id } },
    });
    if (exists) return NextResponse.json({ error: "A shift with this name already exists." }, { status: 400 });

    const graceRaw = body.graceMinutes != null ? Number(body.graceMinutes) : shift.graceMinutes;
    const graceMinutes = Number.isFinite(graceRaw) ? Math.min(120, Math.max(0, Math.round(graceRaw))) : 0;

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        name,
        code: body.code ?? shift.code,
        startTime,
        endTime,
        graceMinutes,
        isNightShift: body.isNightShift != null ? Boolean(body.isNightShift) : shift.isNightShift,
      },
    });
    return NextResponse.json({ shift: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update shift." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
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
