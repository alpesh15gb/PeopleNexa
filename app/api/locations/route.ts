import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** GET — list locations with their branches (admin, supervisor, branch_manager). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const locations = await prisma.location.findMany({
    where: { tenantId: session.tenantId },
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

/** POST — create a location (admin). Body: { name, code }. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
    }
    const exists = await prisma.location.findFirst({ where: { tenantId: session.tenantId, code } });
    if (exists) return NextResponse.json({ error: "A location with this code already exists." }, { status: 400 });
    const location = await prisma.location.create({
      data: { tenantId: session.tenantId, name, code },
    });
    return NextResponse.json({ location }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create location." }, { status: 500 });
  }
}
