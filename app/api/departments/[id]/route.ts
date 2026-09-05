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
  const department = await prisma.department.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!department) return NextResponse.json({ error: "not found" }, { status: 404 });

  let name = department.name;
  if (body.name !== undefined) {
    name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Department name is required." }, { status: 400 });
    const exists = await prisma.department.findFirst({
      where: { tenantId: session.tenantId, name, NOT: { id } },
    });
    if (exists) return NextResponse.json({ error: "A department with this name already exists." }, { status: 400 });
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      name,
      description: body.description ?? department.description,
    },
  });
  return NextResponse.json({ department: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const department = await prisma.department.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!department) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
