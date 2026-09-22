import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { requireActiveSession } from "@/lib/session";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager", "branch_manager"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ designations: await prisma.designation.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }] }) });
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "location_manager"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = String((await request.json().catch(() => ({}))).name ?? "").trim();
  if (!name || name.length > 100) return NextResponse.json({ error: "Designation name must be 1-100 characters." }, { status: 400 });
  try {
    const designation = await prisma.designation.create({ data: { tenantId: session.tenantId, name } });
    await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "designation.create", entity: "Designation", entityId: designation.id, summary: `Created designation ${name}`, after: designation });
    return NextResponse.json({ designation }, { status: 201 });
  } catch { return NextResponse.json({ error: "A designation with that name already exists." }, { status: 409 }); }
}
