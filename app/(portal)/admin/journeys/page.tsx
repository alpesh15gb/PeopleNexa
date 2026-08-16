import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, endOfDay, todayKey } from "@/lib/dates";
import { pathDistanceKm } from "@/lib/geo";
import { shiftWindow } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { clipToDuty } from "@/lib/journey";
import { JourneysPanel } from "./journeys-panel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  const dateKey = todayKey();
  const dayStart = fromDateKey(dateKey);
  const dayEnd = endOfDay(dayStart);

  const [pings, employees, latestPings, attendanceRows] = await Promise.all([
    prisma.locationPing.findMany({
      where: { tenantId: session.tenantId, at: { gte: dayStart, lte: dayEnd } },
      orderBy: { at: "asc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, shift: true } } },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, shift: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.locationPing.findMany({
      where: { tenantId: session.tenantId, at: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      orderBy: { at: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } } },
      take: 500,
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
    const dutyPoints = clipToDuty(
      list.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at.toISOString(), accuracy: p.accuracy })),
      record,
      window
    );
    return {
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeNumber: employee.employeeNumber,
        position: employee.position,
      },
      pingCount: dutyPoints.length,
      distanceKm: Math.round(pathDistanceKm(dutyPoints) * 100) / 100,
      startAt: dutyPoints[0]?.at ?? null,
      endAt: dutyPoints[dutyPoints.length - 1]?.at ?? null,
      points: dutyPoints,
    };
  }).filter((j) => j.points.length > 0);

  const latestByEmployee = new Map<string, (typeof latestPings)[number]>();
  for (const p of latestPings) {
    if (!latestByEmployee.has(p.employeeId)) latestByEmployee.set(p.employeeId, p);
  }
  const live = [...latestByEmployee.values()].map((p) => ({
    employee: {
      id: p.employee.id,
      firstName: p.employee.firstName,
      lastName: p.employee.lastName,
      employeeNumber: p.employee.employeeNumber,
      position: p.employee.position,
    },
    lat: p.lat,
    lng: p.lng,
    at: p.at.toISOString(),
  }));

  const trackedIds = new Set(journeys.map((j) => j.employee.id));
  const attendedIds = new Set(attendanceRows.map((r) => r.employeeId));
  // Honest transparency: employees who were at work but never shared location
  // (permission blocked / GPS off) are shown separately from absent employees.
  const locationOff = employees
    .filter((e) => attendedIds.has(e.id) && !trackedIds.has(e.id))
    .map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeNumber: e.employeeNumber, position: e.position }));
  const untracked = employees
    .filter((e) => !attendedIds.has(e.id) && !trackedIds.has(e.id))
    .map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeNumber: e.employeeNumber, position: e.position }));

  return (
    <JourneysPanel
      date={dateKey}
      journeys={journeys.map((j) => ({ ...j, points: j.points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at, accuracy: p.accuracy ?? null })) }))}
      locationOff={locationOff}
      untracked={untracked}
      live={live}
      employees={employees.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeNumber: e.employeeNumber, position: e.position }))}
    />
  );
}
