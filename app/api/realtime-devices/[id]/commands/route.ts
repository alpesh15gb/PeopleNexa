import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const COMMANDS = ["reboot", "sync_time", "unlock_door", "screen_message"] as const;

// POST /api/realtime-devices/[id]/commands { action, message? }
// Queued for pickup via /api/realtime/poll. GET lists history.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; message?: unknown };
  const action = String(body.action ?? "");
  if (!(COMMANDS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Unknown command." }, { status: 400 });
  }
  const command =
    action === "screen_message"
      ? JSON.stringify({ kind: "screen-message", message: String(body.message ?? "").slice(0, 200) })
      : action === "sync_time"
        ? JSON.stringify({ kind: "sync-time", server_time: new Date().toISOString() })
        : action === "unlock_door"
          ? JSON.stringify({ kind: "unlock-door" })
          : "REBOOT";
  if (action === "screen_message" && !String(body.message ?? "").trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const queued = await prisma.realtimeCommand.create({
    data: { realtimeDeviceId: id, command, status: "pending" },
  });
  return NextResponse.json({ queued }, { status: 201 });
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
  const commands = await prisma.realtimeCommand.findMany({
    where: { realtimeDeviceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ commands });
}
