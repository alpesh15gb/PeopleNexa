import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** PATCH — { action: "verify" | "reject", note? } (admin only). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const declaration = await prisma.taxDeclaration.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!declaration) return NextResponse.json({ error: "Declaration not found." }, { status: 404 });

  const status = action === "verify" ? "verified" : action === "reject" ? "rejected" : null;
  if (!status) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const updated = await prisma.taxDeclaration.update({
    where: { id },
    data: { status, note: body.note ? String(body.note) : null },
  });
  return NextResponse.json({ declaration: updated });
}
