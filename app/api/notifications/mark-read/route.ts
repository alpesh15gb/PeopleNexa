import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await prisma.notification.updateMany({
      where: { employeeId: session.sub, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Notification id required." }, { status: 400 });
  await prisma.notification.updateMany({
    where: { id, employeeId: session.sub },
    data: { isRead: true },
  });
  return NextResponse.json({ success: true });
}
