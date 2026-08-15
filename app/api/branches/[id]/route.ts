import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const branch = await prisma.branch.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!branch) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.branch.update({
    where: { id },
    data: {
      name: body.name ?? branch.name,
      address: body.address ?? branch.address,
      latitude: body.latitude != null ? Number(body.latitude) : body.latitude === "" ? null : branch.latitude,
      longitude: body.longitude != null ? Number(body.longitude) : body.longitude === "" ? null : branch.longitude,
      geofenceRadius: body.geofenceRadius != null ? Number(body.geofenceRadius) : branch.geofenceRadius,
    },
  });
  return NextResponse.json({ branch: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const branch = await prisma.branch.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!branch) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (branch.isDefault) {
    return NextResponse.json({ error: "The default branch cannot be deleted." }, { status: 400 });
  }
  await prisma.branch.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
