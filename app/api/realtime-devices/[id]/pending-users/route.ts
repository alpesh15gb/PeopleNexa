import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function owned(id: string, tenantId: string) {
  return prisma.realtimeDevice.findFirst({ where: { id, tenantId } });
}

// Active employees with no punch ever via this device (push backlog).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!(await owned(id, session.tenantId))) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const seen = await prisma.punch.findMany({
    where: { realtimeDeviceId: id },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  const seenIds = new Set(seen.map((s) => s.employeeId));
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "active" },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, email: true },
    orderBy: { employeeNumber: "asc" },
    take: 500,
  });
  const pending = employees.filter((e) => !seenIds.has(e.id));
  return NextResponse.json({ status: true, count: pending.length, unmapped_count: pending.length, data: pending });
}
