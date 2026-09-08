import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
    }
    const exists = await prisma.branch.findFirst({
      where: { tenantId: session.tenantId, code },
    });
    if (exists) return NextResponse.json({ error: "A branch with this code already exists." }, { status: 400 });

    let locationId: string | null = null;
    if (body.locationId != null && body.locationId !== "") {
      const loc = await prisma.location.findFirst({
        where: { id: String(body.locationId), tenantId: session.tenantId },
        select: { id: true },
      });
      if (!loc) return NextResponse.json({ error: "Location not found in this workspace." }, { status: 400 });
      locationId = loc.id;
    }

    const branch = await prisma.branch.create({
      data: {
        tenantId: session.tenantId,
        name,
        code,
        locationId,
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
          const raw = body.geofenceRadius;
          if (raw === undefined || raw === null || raw === "") return 200;
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error("invalid-radius");
          return Math.min(5000, Math.max(50, Math.round(n)));
        })(),
      },
    });
    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message === "invalid-lat" || err.message === "invalid-lng")) {
      return NextResponse.json({ error: "Latitude must be -90…90 and longitude -180…180." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "invalid-radius") {
      return NextResponse.json({ error: "Geofence radius must be a number." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create branch." }, { status: 500 });
  }
}
