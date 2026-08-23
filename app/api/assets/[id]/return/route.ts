import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = body.note ? String(body.note).trim() : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!asset) throw new Error("ASSET_NOT_FOUND");
      if (asset.status !== "assigned") throw new Error("ASSET_NOT_ASSIGNED");

      const open = await tx.assetAssignment.findFirst({
        where: { assetId: asset.id, returnedAt: null, employee: { tenantId: session.tenantId } },
        orderBy: { assignedAt: "desc" },
      });
      if (!open) throw new Error("OPEN_ASSIGNMENT_NOT_FOUND");

      await tx.assetAssignment.update({
        where: { id: open.id },
        data: { returnedAt: new Date(), note: note ?? open.note },
      });
      const changed = await tx.asset.updateMany({
        where: { id: asset.id, tenantId: session.tenantId, status: "assigned" },
        data: { status: "available" },
      });
      if (changed.count !== 1) throw new Error("ASSET_STATE_CHANGED");
      return { asset, employeeId: open.employeeId };
    });

    await notifyEmployee(session.tenantId, result.employeeId, "info", "Asset returned", `${result.asset.name}${result.asset.tag ? ` (${result.asset.tag})` : ""} was returned and is now available in the pool.`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "ASSET_NOT_FOUND") return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (message === "ASSET_NOT_ASSIGNED" || message === "OPEN_ASSIGNMENT_NOT_FOUND") return NextResponse.json({ error: "This asset has no active assignment to return." }, { status: 409 });
    if (message === "ASSET_STATE_CHANGED") return NextResponse.json({ error: "The asset changed state while being returned. Retry." }, { status: 409 });
    return NextResponse.json({ error: "Asset return failed." }, { status: 500 });
  }
}
