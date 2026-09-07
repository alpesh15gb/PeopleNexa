import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// POST { mode: "all" | "unmapped", target_device_id? } queues a sync task
// consumed via /api/realtime/poll. GET lists task history.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { mode?: unknown; target_device_id?: unknown };
  const mode = body.mode === "all" ? "all" : "unmapped";
  const targetId = typeof body.target_device_id === "string" ? body.target_device_id : null;
  if (targetId && !(await prisma.realtimeDevice.findFirst({ where: { id: targetId, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Target device not found" }, { status: 404 });
  }
  const queued = await prisma.realtimeCommand.create({
    data: {
      realtimeDeviceId: targetId ?? id,
      command: JSON.stringify({ kind: "bulk-sync", mode, sourceDeviceId: id }),
      status: "pending",
    },
  });
  await prisma.realtimeDevice.update({ where: { id }, data: { lastSyncAt: new Date() } });
  const pendingCount = await prisma.realtimeCommand.count({
    where: { realtimeDeviceId: targetId ?? id, status: "pending" },
  });
  return NextResponse.json({ success: true, task: queued, pendingCount }, { status: 201 });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const tasks = await prisma.realtimeCommand.findMany({
    where: { realtimeDeviceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ status: true, data: tasks });
}
