import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { optionalDateInput } from "@/lib/dates";
import { documentAttachment } from "@/lib/document-attachment";

/** PATCH — update expiry/notes/number. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const doc = await prisma.document.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "A document object is required." }, { status: 400 });
  if (body.expectedUpdatedAt !== undefined) {
    const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
    if (!expected || Number.isNaN(expected.getTime())) return NextResponse.json({ error: "Document revision is invalid." }, { status: 400 });
    if (expected.getTime() !== doc.updatedAt.getTime()) return NextResponse.json({ error: "This document changed. Reopen it before saving." }, { status: 409 });
  }
  const data: Record<string, unknown> = {};
  if (body.issuedDate !== undefined || body.expiryDate !== undefined) {
    const issuedDate = body.issuedDate !== undefined ? optionalDateInput(body.issuedDate) : doc.issuedDate;
    const expiryDate = body.expiryDate !== undefined ? optionalDateInput(body.expiryDate) : doc.expiryDate;
    if (issuedDate === "invalid" || expiryDate === "invalid") return NextResponse.json({ error: "Enter valid issue and expiry dates." }, { status: 400 });
    if (issuedDate && expiryDate && expiryDate < issuedDate) return NextResponse.json({ error: "Expiry date must be on or after the issue date." }, { status: 400 });
    if (body.issuedDate !== undefined) data.issuedDate = issuedDate;
    if (body.expiryDate !== undefined) data.expiryDate = expiryDate;
  }
  if (body.fileUrl !== undefined) {
    const fileUrl = body.fileUrl ? String(body.fileUrl).trim() : null;
    if (fileUrl && !documentAttachment(fileUrl, session.tenantId)) return NextResponse.json({ error: "Attach a PDF or supported image up to 2 MB, or enter an HTTPS link." }, { status: 400 });
    data.fileUrl = fileUrl;
  }
  if (body.number !== undefined) data.number = body.number ? String(body.number).trim() : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Document name is required." }, { status: 400 });
    data.name = name;
  }

  const [updated] = await prisma.document.updateManyAndReturn({ where: { id, tenantId: session.tenantId, updatedAt: doc.updatedAt }, data });
  if (!updated) return NextResponse.json({ error: "This document changed. Reopen it before saving." }, { status: 409 });
  return NextResponse.json({ doc: updated });
}

/** DELETE — remove a document record. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const removed = await prisma.document.deleteMany({ where: { id, tenantId: session.tenantId } });
  if (!removed.count) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
