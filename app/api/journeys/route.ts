import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, endOfDay, todayKey } from "@/lib/dates";
import { pathDistanceKm } from "@/lib/geo";
import { shiftWindow } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { clipToDuty } from "@/lib/journey";

/** GET — day routes for one employee (or all active employees) + summary. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dateKey = req.nextUrl.searchParams.get("date") || todayKey();
  const dayStart = fromDateKey(dateKey);
  const dayEnd = endOfDay(dayStart);

  const employeeId = req.nextUrl.searchParams.get("employeeId") || undefined;
  const where = {
    tenantId: session.tenantId,
    ...(employeeId ? { employeeId } : {}),
    at: { gte: dayStart, lte: dayEnd },
  };

  const [pings, employees, attendanceRows] = await Promise.all([
    prisma.locationPing.findMany({
      where,
      orderBy: { at: "asc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, shift: true } } },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, shift: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: dayStart, lte: dayEnd } },
      select: { employeeId: true, punchInTime: true, punchOutTime: true },
    }),
  ]);

  const byEmployee = new Map<string, typeof pings>();
  for (const p of pings) {
    if (!byEmployee.has(p.employeeId)) byEmployee.set(p.employeeId, []);
    byEmployee.get(p.employeeId)!.push(p);
  }

  const recordByEmployee = new Map(attendanceRows.map((r) => [r.employeeId, r]));

  const journeys = [...byEmployee.entries()].map(([empId, list]) => {
    const employee = list[0].employee;
    const record = recordByEmployee.get(empId) ?? null;
    const window = shiftWindow(istStartOfDay(dayStart), employee.shift);
    // Privacy: only show pings inside the on-duty span (punch-in → punch-out).
    const dutyPoints = clipToDuty(
      list.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at.toISOString(), accuracy: p.accuracy })),
      record,
      window
    );
    return {
      employee,
      pingCount: dutyPoints.length,
      distanceKm: Math.round(pathDistanceKm(dutyPoints) * 100) / 100,
      startAt: dutyPoints[0]?.at ?? null,
      endAt: dutyPoints[dutyPoints.length - 1]?.at ?? null,
      points: dutyPoints,
    };
  }).filter((j) => j.points.length > 0);

  const trackedIds = new Set(journeys.map((j) => j.employee.id));
  const untracked = employees.filter((e) => !trackedIds.has(e.id));

  return NextResponse.json({ date: dateKey, journeys, untracked });
}
