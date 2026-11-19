import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** GET — list locations with their branches (admin, supervisor, branch_manager). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const manager = session.role === "location_manager" ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }) : null;
  if (session.role === "location_manager" && !manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const locations = await prisma.location.findMany({
    where: { tenantId: session.tenantId, ...(manager?.locationId ? { id: manager.locationId } : {}) },
    include: {
      branches: {
        select: { id: true, name: true, code: true, _count: { select: { employees: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ locations });
}

/** POST — create a location and optionally assign its branches in one write. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Provide location details as an object." }, { status: 400 });
    }
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!name || !code || name.length > 120 || code.length > 32) {
      return NextResponse.json({ error: "Enter a name of up to 120 characters and a code of up to 32 characters." }, { status: 400 });
    }
    if (body.branchIds !== undefined && (!Array.isArray(body.branchIds) || body.branchIds.some((id: unknown) => typeof id !== "string" || !id))) {
      return NextResponse.json({ error: "Select branches from this workspace." }, { status: 400 });
    }
    const branchIds = [...new Set<string>(body.branchIds ?? [])];
    const exists = await prisma.location.findFirst({ where: { tenantId: session.tenantId, code } });
    if (exists) return NextResponse.json({ error: "A location with this code already exists." }, { status: 400 });
    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.location.create({ data: { tenantId: session.tenantId, name, code } });
      if (branchIds.length) {
        const changed = await tx.branch.updateMany({
          where: { tenantId: session.tenantId, id: { in: branchIds } },
          data: { locationId: created.id },
        });
        if (changed.count !== branchIds.length) throw new Error("invalid-branches");
      }
      return created;
    });
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-branches") return NextResponse.json({ error: "One or more branches do not belong to this workspace." }, { status: 400 });
    if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "A location with this code already exists." }, { status: 409 });
    return NextResponse.json({ error: "Failed to create location." }, { status: 500 });
  }
}
