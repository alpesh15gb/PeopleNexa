import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const asset = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  if (asset.status !== "assigned") {
    return NextResponse.json({ error: "This asset is not currently assigned." }, { status: 400 });
  }

  const open = await prisma.assetAssignment.findFirst({
    where: { assetId: asset.id, returnedAt: null },
  });
  if (!open) {
    return NextResponse.json({ error: "No open assignment found for this asset." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const note = body.note ? String(body.note).trim() : null;

  await prisma.$transaction([
    prisma.assetAssignment.update({
      where: { id: open.id },
      data: { returnedAt: new Date(), note: note ?? open.note },
    }),
    prisma.asset.update({ where: { id: asset.id }, data: { status: "available" } }),
  ]);

  await notifyEmployee(
    session.tenantId,
    open.employeeId,
    "info",
    "Asset returned",
    `${asset.name}${asset.tag ? ` (${asset.tag})` : ""} was returned and is now available in the pool.`
  );

  return NextResponse.json({ success: true });
}
