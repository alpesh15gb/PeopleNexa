import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      settings: device.config ?? {},
      info: {
        product_name: device.productName,
        supported_enroll_data: device.capabilities,
        protocol: device.protocol,
        ip_address: device.ipAddress,
      },
    },
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { setting_name?: unknown; value?: unknown };
  const settingName = String(body.setting_name ?? "").trim();
  if (!settingName) return NextResponse.json({ error: "setting_name is required" }, { status: 400 });
  // Whitelist: arbitrary config keys would let callers scribble over the
  // device config blob (and queue misleading SET commands).
  const ALLOWED_SETTINGS = new Set([
    "volume",
    "brightness",
    "sleep_timeout",
    "door_delay",
    "verify_mode",
    "language",
    "timezone",
    "attendance_repeat_time",
  ]);
  if (!ALLOWED_SETTINGS.has(settingName)) {
    return NextResponse.json({ error: `Unknown setting "${settingName}".` }, { status: 400 });
  }

  const config = { ...((device.config ?? {}) as Record<string, unknown>), [settingName]: body.value };
  const updated = await prisma.realtimeDevice.update({ where: { id }, data: { config: config as object } });
  await prisma.realtimeCommand.create({
    data: { realtimeDeviceId: id, command: `SET ${settingName}=${String(body.value ?? "")}`.slice(0, 500), status: "pending" },
  });
  return NextResponse.json({ success: true, settings: updated.config });
}
