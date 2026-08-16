import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — admin edits a policy (bumps version when content changes). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const policy = await prisma.policy.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.category !== undefined) data.category = String(body.category).trim();
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.body !== undefined) {
    data.body = String(body.body).trim();
    data.version = policy.version + 1; // versioned edits
  }

  const updated = await prisma.policy.update({ where: { id }, data });
  return NextResponse.json({ policy: updated });
}

/** DELETE — admin removes a policy. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.policy.deleteMany({ where: { id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
