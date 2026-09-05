import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { realtimeCapabilitiesOf, realtimeStatusOf } from "@/lib/realtime-devices";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  return NextResponse.json({
    ...realtimeStatusOf(device),
    last_sync_at: device.lastSyncAt,
    product_name: device.productName,
    capabilities: realtimeCapabilitiesOf(device),
    linked_devices: device.linkedDeviceIds,
    has_api_key: Boolean(device.apiKey),
  });
}
