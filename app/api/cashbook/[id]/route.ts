import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const CATEGORIES = ["salary", "advance", "vendor", "expense", "other"] as const;
const MODES = ["cash", "upi", "bank", "other"] as const;

/** PATCH — admin edits note / category / paymentMode only (amount, type, date are immutable). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await prisma.cashbookEntry.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { note?: string | null; category?: string; paymentMode?: string | null } = {};

  if (body.category !== undefined) {
    const category = String(body.category);
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "category must be salary, advance, vendor, expense or other." }, { status: 400 });
    }
    data.category = category;
  }

  if (body.note !== undefined) {
    const noteRaw = body.note === null ? "" : String(body.note).trim();
    if (noteRaw.length > 500) {
      return NextResponse.json({ error: "Note must be 500 characters or fewer." }, { status: 400 });
    }
    data.note = noteRaw === "" ? null : noteRaw;
  }

  if (body.paymentMode !== undefined) {
    if (body.paymentMode === null || String(body.paymentMode).trim() === "") {
      data.paymentMode = null;
    } else {
      const v = String(body.paymentMode).trim().toLowerCase();
      if (!(MODES as readonly string[]).includes(v)) {
        return NextResponse.json({ error: "paymentMode must be cash, upi, bank or other." }, { status: 400 });
      }
      data.paymentMode = v;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update (note, category, paymentMode only)." }, { status: 400 });
  }

  const entry = await prisma.cashbookEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

/** DELETE — admin removes an entry (tenant-scoped). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await prisma.cashbookEntry.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  await prisma.cashbookEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
