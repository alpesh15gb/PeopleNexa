import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scope = { tenantId: session.tenantId, employeeId: session.sub };
  if (body.all === true) {
    await prisma.notification.updateMany({
      where: { ...scope, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Notification id required." }, { status: 400 });
  await prisma.notification.updateMany({
    where: { ...scope, id },
    data: { isRead: true },
  });
  return NextResponse.json({ success: true });
}
