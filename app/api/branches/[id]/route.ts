import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const branch = await prisma.branch.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!branch) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    let name = branch.name;
    if (body.name !== undefined) {
      name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Branch name is required." }, { status: 400 });
    }

    let code = branch.code;
    if (body.code !== undefined) {
      code = String(body.code).trim().toUpperCase();
      if (!code) return NextResponse.json({ error: "Branch code is required." }, { status: 400 });
      const exists = await prisma.branch.findFirst({
        where: { tenantId: session.tenantId, code, NOT: { id } },
      });
      if (exists) return NextResponse.json({ error: "A branch with this code already exists." }, { status: 400 });
    }

    const parseCoord = (v: unknown, min: number, max: number): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) throw new Error("invalid-coord");
      return n;
    };
    const latitude = parseCoord(body.latitude, -90, 90);
    const longitude = parseCoord(body.longitude, -180, 180);

    let geofenceRadius = branch.geofenceRadius;
    if (body.geofenceRadius !== undefined && body.geofenceRadius !== null && body.geofenceRadius !== "") {
      const n = Number(body.geofenceRadius);
      if (!Number.isFinite(n)) return NextResponse.json({ error: "Geofence radius must be a number." }, { status: 400 });
      geofenceRadius = Math.min(5000, Math.max(50, Math.round(n)));
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        name,
        code,
        address: body.address ?? branch.address,
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        geofenceRadius,
      },
    });
    return NextResponse.json({ branch: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "invalid-coord") {
      return NextResponse.json({ error: "Latitude must be -90…90 and longitude -180…180." }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
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
