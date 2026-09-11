import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Device codes with no matching employee (scan result), from flagged RealtimeLogs.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const flagged = await prisma.realtimeLog.findMany({
    where: { realtimeDeviceId: id, error: { not: null }, userId: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });
  const codes = flagged.map((f) => f.userId as string);
  if (codes.length === 0) return NextResponse.json({ status: true, data: [] });
  const existing = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, OR: [{ deviceCode: { in: codes } }, { deviceCode: null, employeeNumber: { in: codes } }] },
    select: { deviceCode: true, employeeNumber: true },
  });
  const known = new Set(existing.map((e) => e.deviceCode ?? e.employeeNumber));
  return NextResponse.json({ status: true, data: codes.filter((c) => !known.has(c)).map((code) => ({ code })) });
}
