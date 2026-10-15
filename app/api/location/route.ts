import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istStartOfDay } from "@/lib/ist";

/** POST — employee streams a location ping (only accepted while on duty). */
export async function POST() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "Journey tracking is disabled. Location is captured only with attendance punches." }, { status: 410 });
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
