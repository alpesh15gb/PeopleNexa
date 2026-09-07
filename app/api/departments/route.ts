import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const departments = await prisma.department.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ departments });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Department name is required." }, { status: 400 });
    const exists = await prisma.department.findFirst({ where: { tenantId: session.tenantId, name: { equals: name, mode: "insensitive" } } });
    if (exists) return NextResponse.json({ error: "A department with this name already exists." }, { status: 400 });

    const department = await prisma.department.create({
      data: {
        tenantId: session.tenantId,
        name,
        description: body.description ?? null,
      },
    });
    return NextResponse.json({ department }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create department." }, { status: 500 });
  }
}
