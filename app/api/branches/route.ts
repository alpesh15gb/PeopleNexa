import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
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
        latitude:
          body.latitude != null && body.latitude !== ""
            ? (() => {
                const n = Number(body.latitude);
                if (!Number.isFinite(n) || n < -90 || n > 90) throw new Error("invalid-lat");
                return n;
              })()
            : null,
        longitude:
          body.longitude != null && body.longitude !== ""
            ? (() => {
                const n = Number(body.longitude);
                if (!Number.isFinite(n) || n < -180 || n > 180) throw new Error("invalid-lng");
                return n;
              })()
            : null,
        geofenceRadius: (() => {
          const n = Number(body.geofenceRadius);
          if (!Number.isFinite(n)) return 200;
          return Math.min(5000, Math.max(50, Math.round(n)));
        })(),
      },
    });
    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message === "invalid-lat" || err.message === "invalid-lng")) {
      return NextResponse.json({ error: "Latitude must be -90…90 and longitude -180…180." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create branch." }, { status: 500 });
  }
}
