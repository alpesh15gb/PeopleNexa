import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { mintRealtimeApiKey } from "@/lib/realtime-devices";

async function findOwned(id: string, tenantId: string) {
  return prisma.realtimeDevice.findFirst({ where: { id, tenantId } });
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
    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(body.ipAddress !== undefined
        ? { ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null }
        : {}),
      ...(body.protocol === "wss" || body.protocol === "fkweb" ? { protocol: body.protocol } : {}),
      ...(typeof body.status === "string" ? { status: body.status } : {}),
      ...(body.productName !== undefined
        ? { productName: body.productName ? String(body.productName).trim() : null }
        : {}),
      ...(Array.isArray(body.capabilities) ? { capabilities: (body.capabilities as unknown[]).map(String) } : {}),
    };
    if (body.rotateApiKey === true) data.apiKey = mintRealtimeApiKey();
    const updated = await prisma.realtimeDevice.update({ where: { id }, data: data as never });
    return NextResponse.json({ device: { ...updated, apiKey: body.rotateApiKey === true ? updated.apiKey : undefined } });
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

  await prisma.realtimeDevice.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
