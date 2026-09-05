import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — update expiry/notes/number. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const doc = await prisma.document.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
  if (body.number !== undefined) data.number = body.number ? String(body.number).trim() : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
  if (body.name !== undefined) data.name = String(body.name).trim();

  const updated = await prisma.document.update({ where: { id }, data });
  return NextResponse.json({ doc: updated });
}

/** DELETE — remove a document record. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const doc = await prisma.document.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
