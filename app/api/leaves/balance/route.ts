import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [types, requests] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub, status: { in: ["approved", "pending"] } },
      select: { leaveTypeId: true, days: true, status: true },
    }),
  ]);

  const used = new Map<string, number>();
  for (const r of requests) {
    used.set(r.leaveTypeId, (used.get(r.leaveTypeId) ?? 0) + r.days);
  }

  const balance = types.map((t) => {
    const usedDays = used.get(t.id) ?? 0;
    return {
      ...t,
      used: usedDays,
      remaining: Math.max(t.maxDays - usedDays, 0),
    };
  });

  return NextResponse.json({ balance });
}
