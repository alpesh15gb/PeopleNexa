import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Linked realtime devices share enroll data automatically.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { target_device_ids?: unknown };
  const targets: string[] = Array.isArray(body.target_device_ids)
    ? (body.target_device_ids as unknown[]).map((v) => String(v))
    : [];
  const unique: string[] = [...new Set(targets.filter((t: string) => t && t !== id))];
  if (unique.length > 0) {
    const count = await prisma.realtimeDevice.count({ where: { id: { in: unique }, tenantId: session.tenantId } });
    if (count !== unique.length) {
      return NextResponse.json({ error: "One or more target devices were not found." }, { status: 400 });
    }
  }
  const updated = await prisma.realtimeDevice.update({ where: { id }, data: { linkedDeviceIds: unique } });
  return NextResponse.json({ success: true, linked_devices: updated.linkedDeviceIds });
}
