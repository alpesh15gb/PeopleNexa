import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function findOwned(id: string, tenantId: string) {
  return prisma.device.findFirst({ where: { id, tenantId } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await findOwned(id, session.tenantId);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  try {
    const body = await req.json();
    if (body.status !== undefined && body.status !== "active" && body.status !== "inactive") {
      return NextResponse.json({ error: "Invalid status. Allowed: active, inactive." }, { status: 400 });
    }
    if (body.type !== undefined && !["biometric", "face", "card"].includes(String(body.type))) {
      return NextResponse.json({ error: "Invalid type. Allowed: biometric, face, card." }, { status: 400 });
    }
    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(body.name ? { name: String(body.name).trim() } : {}),
        ...(body.ipAddress !== undefined ? { ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null } : {}),
        ...(body.type ? { type: String(body.type) } : {}),
        ...(body.protocol ? { protocol: String(body.protocol) } : {}),
        ...(body.status ? { status: String(body.status) } : {}),
      },
    });
    return NextResponse.json({ device: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update device." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await findOwned(id, session.tenantId);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // Destructive deletes would orphan attendance history — block while any
  // DeviceLog / Punch / DeviceCommand rows still reference this device.
  const [logCount, punchCount, commandCount] = await Promise.all([
    prisma.deviceLog.count({ where: { deviceId: id } }),
    prisma.punch.count({ where: { deviceId: id } }),
    prisma.deviceCommand.count({ where: { deviceId: id } }),
  ]);
  if (logCount + punchCount + commandCount > 0) {
    return NextResponse.json(
      { error: "Device has attendance history — retire instead; export logs first." },
      { status: 400 }
    );
  }

  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
