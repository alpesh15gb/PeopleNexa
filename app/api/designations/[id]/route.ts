import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { canManageDesignations } from "@/lib/designation-access";
import { requireActiveSession } from "@/lib/session";
import { normalizeDesignationName } from "@/lib/designation";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!canManageDesignations(session.role)) return NextResponse.json({ error: "You do not have permission to manage designations." }, { status: 403 });
  const { id } = await context.params; const current = await prisma.designation.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})); const name = body.name === undefined ? current.name : normalizeDesignationName(body.name);
  if (!name || name.length > 100 || (body.active !== undefined && typeof body.active !== "boolean")) return NextResponse.json({ error: "Invalid designation." }, { status: 400 });
  try { const designation = await prisma.designation.update({ where: { id }, data: { name, normalizedName: name.toLowerCase(), active: body.active ?? current.active } }); await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: designation.active ? "designation.update" : "designation.deactivate", entity: "Designation", entityId: id, before: current, after: designation }); return NextResponse.json({ designation }); } catch { return NextResponse.json({ error: "A designation with that name already exists." }, { status: 409 }); }
}
