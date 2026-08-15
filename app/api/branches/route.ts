import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.name || !body.code) {
      return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
    }
    const code = String(body.code).toUpperCase();
    const exists = await prisma.branch.findFirst({
      where: { tenantId: session.tenantId, code },
    });
    if (exists) return NextResponse.json({ error: "A branch with this code already exists." }, { status: 400 });

    const branch = await prisma.branch.create({
      data: {
        tenantId: session.tenantId,
        name: body.name,
        code,
        address: body.address ?? null,
        latitude: body.latitude != null ? Number(body.latitude) : null,
        longitude: body.longitude != null ? Number(body.longitude) : null,
        geofenceRadius: Number(body.geofenceRadius) || 200,
      },
    });
    return NextResponse.json({ branch }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create branch." }, { status: 500 });
  }
}
