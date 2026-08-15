import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);
  const notifications = await prisma.notification.findMany({
    where: { employeeId: session.sub },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: limit,
  });

  const unread = await prisma.notification.count({
    where: { employeeId: session.sub, isRead: false },
  });

  return NextResponse.json({ notifications, unread });
}
