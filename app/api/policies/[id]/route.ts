import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — admin edits a policy (bumps version when content changes). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const policy = await prisma.policy.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const input = await req.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Policy changes are required." }, { status: 400 });
  const { title = policy.title, category = policy.category, body = policy.body, active = policy.active, expectedUpdatedAt } = input;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 180 ||
      typeof body !== "string" || !body.trim() || body.trim().length > 50_000 ||
      typeof category !== "string" || !category.trim() || category.trim().length > 80 || typeof active !== "boolean") {
    return NextResponse.json({ error: "Provide a title, a category and policy text within the field limits." }, { status: 400 });
  }
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== policy.updatedAt.toISOString()) {
    return NextResponse.json({ error: "This policy changed. Refresh before editing it again." }, { status: 409 });
  }
  const contentChanged = title.trim() !== policy.title || category.trim() !== policy.category || body.trim() !== policy.body;
  const changed = await prisma.policy.updateMany({
    where: { id, tenantId: session.tenantId, updatedAt: policy.updatedAt },
    data: { title: title.trim(), category: category.trim(), body: body.trim(), active, ...(contentChanged ? { version: { increment: 1 } } : {}) },
  });
  if (!changed.count) return NextResponse.json({ error: "This policy changed. Refresh before editing it again." }, { status: 409 });
  const updated = await prisma.policy.findFirst({ where: { id, tenantId: session.tenantId } });
  return NextResponse.json({ policy: updated });
}

/** DELETE — admin removes a policy. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.policy.deleteMany({ where: { id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
