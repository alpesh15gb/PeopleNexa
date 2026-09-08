import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PUT — rename a location (admin). DELETE — remove if no branches attached (admin). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const location = await prisma.location.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!location) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  let name = location.name;
  if (body.name !== undefined) {
    name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Location name is required." }, { status: 400 });
  }
  let code = location.code;
  if (body.code !== undefined) {
    code = String(body.code).trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Location code is required." }, { status: 400 });
    const clash = await prisma.location.findFirst({
      where: { tenantId: session.tenantId, code, NOT: { id } },
    });
    if (clash) return NextResponse.json({ error: "A location with this code already exists." }, { status: 400 });
  }
  const updated = await prisma.location.update({ where: { id }, data: { name, code } });
  return NextResponse.json({ location: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const location = await prisma.location.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!location) return NextResponse.json({ error: "not found" }, { status: 404 });
  const attached = await prisma.branch.count({ where: { locationId: id } });
  if (attached > 0) {
    return NextResponse.json(
      { error: `Move or unassign the ${attached} branch(es) first — a location with branches cannot be deleted.` },
      { status: 400 }
    );
  }
  await prisma.location.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
