import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Employees already punching via this device (push candidates for linked devices).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await prisma.realtimeDevice.findFirst({ where: { id, tenantId: session.tenantId } }))) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  const seen = await prisma.punch.findMany({
    where: { realtimeDeviceId: id },
    select: { employeeId: true },
    distinct: ["employeeId"],
    take: 1000,
  });
  if (seen.length === 0) return NextResponse.json({ status: true, data: [] });
  const employees = await prisma.employee.findMany({
    where: { id: { in: seen.map((s) => s.employeeId) } },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
  });
  return NextResponse.json({ status: true, data: employees });
}
