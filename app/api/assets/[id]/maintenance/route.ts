import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { managerLocationId } from "@/lib/location-scope";

const maintenanceStatuses = ["scheduled", "in_progress", "completed"];
const maintenanceTypes = ["service", "repair", "inspection", "other"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const asset = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { locationId } : {}) } });
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  if (asset.status === "assigned") {
    return NextResponse.json({ error: "Return the asset before starting maintenance." }, { status: 400 });
  }
  if (["retired", "lost"].includes(asset.status)) {
    return NextResponse.json({ error: "Retired or lost assets cannot have maintenance recorded." }, { status: 400 });
  }

  const body = await req.json();
  const description = String(body.description ?? "").trim();
  const type = String(body.type ?? "service").trim();
  const status = String(body.status ?? "completed").trim();
  const cost = body.cost === undefined || body.cost === "" ? null : Number(body.cost);
  const performedAt = body.performedAt ? new Date(String(body.performedAt)) : new Date();
  const nextDueDate = body.nextDueDate ? new Date(String(body.nextDueDate)) : null;
  if (!description) return NextResponse.json({ error: "Maintenance description is required." }, { status: 400 });
  if (!maintenanceTypes.includes(type) || !maintenanceStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid maintenance type or status." }, { status: 400 });
  }
  if (Number.isNaN(performedAt.getTime()) || (nextDueDate && Number.isNaN(nextDueDate.getTime()))) {
    return NextResponse.json({ error: "Enter valid maintenance dates." }, { status: 400 });
  }

  const [record] = await prisma.$transaction([
    prisma.assetMaintenance.create({
      data: {
        assetId: asset.id,
        type,
        description,
        provider: body.provider ? String(body.provider).trim() : null,
        cost: Number.isFinite(cost) ? cost : null,
        performedAt,
        nextDueDate,
        status,
        notes: body.notes ? String(body.notes).trim() : null,
        createdBy: session.sub,
      },
    }),
    prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: status === "completed" ? "available" : "maintenance",
        maintenanceDue: nextDueDate,
      },
    }),
  ]);
  return NextResponse.json({ success: true, record }, { status: 201 });
}
