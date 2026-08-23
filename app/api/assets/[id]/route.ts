import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const EDITABLE_STATUSES = new Set(["available", "maintenance", "retired", "lost"]);
const CATEGORIES = new Set(["laptop", "phone", "id_card", "vehicle", "device", "furniture", "other"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      assignments: {
        where: { employee: { tenantId: session.tenantId } },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 160) return NextResponse.json({ error: "Asset name is required and must be under 160 characters." }, { status: 400 });
      data.name = name;
    }
    if (body.category !== undefined) {
      const category = String(body.category).trim();
      if (!CATEGORIES.has(category)) return NextResponse.json({ error: "Invalid asset category." }, { status: 400 });
      data.category = category;
    }
    if (body.tag !== undefined) data.tag = body.tag ? String(body.tag).trim() : null;
    if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber ? String(body.serialNumber).trim() : null;
    if (body.value !== undefined) {
      const value = body.value === "" || body.value === null ? null : Number(body.value);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)) {
        return NextResponse.json({ error: "Asset value must be a valid non-negative amount." }, { status: 400 });
      }
      data.value = value;
    }
    if (body.purchaseDate !== undefined) {
      const purchaseDate = body.purchaseDate ? new Date(String(body.purchaseDate)) : null;
      if (purchaseDate && !Number.isFinite(purchaseDate.getTime())) return NextResponse.json({ error: "Invalid purchase date." }, { status: 400 });
      data.purchaseDate = purchaseDate;
    }
    if (body.status !== undefined) {
      const nextStatus = String(body.status);
      if (!EDITABLE_STATUSES.has(nextStatus)) {
        return NextResponse.json({ error: "Assigned state can only be changed through Assign/Return actions." }, { status: 400 });
      }
      if (existing.status === "assigned") {
        return NextResponse.json({ error: "Return the asset before changing its lifecycle status." }, { status: 409 });
      }
      data.status = nextStatus;
    }
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

    const asset = await prisma.asset.update({ where: { id }, data });
    return NextResponse.json({ success: true, asset });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "An asset with this tag already exists." }, { status: 409 });
    return NextResponse.json({ error: "Failed to update asset." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { _count: { select: { assignments: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  if (existing.status === "assigned" || existing._count.assignments > 0) {
    return NextResponse.json({ error: "Assets with assignment history cannot be deleted. Retire the asset instead." }, { status: 409 });
  }
  await prisma.asset.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
