import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requested = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  if (!Number.isSafeInteger(requested) || requested < 1) return NextResponse.json({ error: "Invalid notification limit." }, { status: 400 });
  const limit = Math.min(requested, 100);
  const where = { tenantId: session.tenantId, employeeId: session.sub };
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  const unread = await prisma.notification.count({
    where: { ...where, isRead: false },
  });

  return NextResponse.json({ notifications, unread });
}
