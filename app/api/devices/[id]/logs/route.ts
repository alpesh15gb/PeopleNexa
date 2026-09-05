import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const device = await prisma.device.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const n = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const take = Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 500) : 100;
  const logs = await prisma.deviceLog.findMany({
    where: { deviceId: id },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json({ logs });
}
