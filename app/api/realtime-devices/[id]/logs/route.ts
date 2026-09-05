import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const n = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const take = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 500) : 100;
  const logs = await prisma.realtimeLog.findMany({
    where: { realtimeDeviceId: id },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ logs });
}
