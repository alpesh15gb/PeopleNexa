import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { trackingState } from "@/lib/journey";
import { istStartOfDay } from "@/lib/ist";

/** POST — employee streams a location ping (only accepted while on duty). */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracy = body.accuracy != null ? Number(body.accuracy) : null;
  const at = body.at ? new Date(body.at) : new Date();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Coordinates out of range." }, { status: 400 });
  }
  if (isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid timestamp." }, { status: 400 });
  }
  if (at.getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: "Timestamp cannot be in the future." }, { status: 400 });
  }
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) {
    return NextResponse.json({ error: "Invalid accuracy." }, { status: 400 });
  }

  // Privacy guard: pings are only stored while the employee is on duty
  // (open attendance session inside the shift window + grace). Off-duty and
  // after-hours locations are rejected and never stored.
  const state = await trackingState(session.tenantId, session.sub);
  if (!state.active) {
    return NextResponse.json({ error: "not_tracking", reason: state.reason }, { status: 403 });
  }

  const ping = await prisma.locationPing.create({
    data: {
      tenantId: session.tenantId,
      employeeId: session.sub,
      lat,
      lng,
      accuracy,
      at,
    },
  });
  return NextResponse.json({ ping }, { status: 201 });
}

/** GET — live map: only employees currently on duty (open session today). */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Employees with an open attendance session right now.
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "active" },
    select: {
      id: true,
      attendance: { orderBy: { date: "desc" }, take: 1, select: { punchInTime: true, punchOutTime: true } },
    },
  });
  const onDutyIds = new Set<string>();
  const todayStart = istStartOfDay(new Date());
  for (const e of employees) {
    const rec = e.attendance[0];
    if (rec?.punchInTime && !rec.punchOutTime && rec.punchInTime >= todayStart) onDutyIds.add(e.id);
  }

  // Latest ping for those employees only (last 24h of duty pings).
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const pings = await prisma.locationPing.findMany({
    where: { tenantId: session.tenantId, at: { gte: since }, employeeId: { in: [...onDutyIds] } },
    orderBy: { at: "desc" },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } } },
    take: 500,
  });
  const byEmployee = new Map<string, (typeof pings)[number]>();
  for (const p of pings) {
    if (!byEmployee.has(p.employeeId)) byEmployee.set(p.employeeId, p);
  }
  const latest = [...byEmployee.values()].map((p) => ({
    employee: p.employee,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    at: p.at.toISOString(),
  }));
  return NextResponse.json({ latest, onDuty: onDutyIds.size });
}
