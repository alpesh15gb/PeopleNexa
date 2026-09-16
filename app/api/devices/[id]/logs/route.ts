import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.device.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, branch: { select: { locationId: true } } },
  });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId || device.branch?.locationId !== manager.locationId) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
  }

  const n = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const take = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 500) : 100;
  const logs = await prisma.deviceLog.findMany({
    where: { deviceId: id },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ logs });
}
