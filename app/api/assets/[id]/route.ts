import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const asset = await prisma.asset.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      assignments: {
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  return NextResponse.json({ asset });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.category !== undefined) data.category = String(body.category).trim();
    if (body.tag !== undefined) data.tag = body.tag ? String(body.tag).trim() : null;
    if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber ? String(body.serialNumber).trim() : null;
    if (body.value !== undefined) {
      const v = body.value === "" || body.value === null ? null : Number(body.value);
      data.value = Number.isFinite(v) ? v : null;
    }
    if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? new Date(String(body.purchaseDate)) : null;
    if (body.status !== undefined) {
      const validStatuses = ["available", "assigned", "maintenance", "retired", "lost"];
      if (!validStatuses.includes(String(body.status))) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = String(body.status);
    }
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const asset = await prisma.asset.update({ where: { id }, data });
    return NextResponse.json({ success: true, asset });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "An asset with this tag already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.asset.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  await prisma.asset.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
