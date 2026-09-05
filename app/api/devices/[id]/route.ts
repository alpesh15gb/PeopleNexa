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

  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
