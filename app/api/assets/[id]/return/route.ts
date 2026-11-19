import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";
import { managerLocationId } from "@/lib/location-scope";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

  const asset = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { locationId } : {}) } });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  const openAssignments = await prisma.assetAssignment.findMany({
    where: { assetId: asset.id, returnedAt: null },
    take: 2,
  });
  if (openAssignments.length > 1) {
    return NextResponse.json({ error: "This asset has multiple open assignments. Its assignment history needs reconciliation." }, { status: 409 });
  }
  const [open] = openAssignments;
  if (!open) {
    return NextResponse.json({ error: "No open assignment found for this asset." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const note = body.note ? String(body.note).trim() : null;

  const returned = await prisma.$transaction(async (tx) => {
    const changed = await tx.asset.updateMany({
      where: { id, tenantId: session.tenantId, ...(locationId ? { locationId } : {}), status: asset.status, assignments: { some: { id: open.id, returnedAt: null } } },
      data: { status: asset.status === "assigned" ? "available" : asset.status },
    });
    if (!changed.count) return false;
    await tx.assetAssignment.update({
      where: { id: open.id, returnedAt: null },
      data: { returnedAt: new Date(), note: note ?? open.note },
    });
    return true;
  }).catch((error: unknown) => {
    if ((error as { code?: string })?.code === "P2025") return false;
    throw error;
  });
  if (!returned) return NextResponse.json({ error: "This asset or its assignment has changed. Refresh the inventory." }, { status: 409 });

  await notifyEmployee(
    session.tenantId,
    open.employeeId,
    "info",
    "Asset returned",
    `${asset.name}${asset.tag ? ` (${asset.tag})` : ""} was returned and is now available in the pool.`
  );

  return NextResponse.json({ success: true });
}
