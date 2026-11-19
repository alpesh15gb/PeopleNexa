import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { pathDistanceKm } from "@/lib/geo";
import { shiftWindow } from "@/lib/reconcile";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, offsetDateKey, timeZoneDayRange } from "@/lib/workspace-time";
import { clipToDuty } from "@/lib/journey";
import { JourneysPanel } from "./journeys-panel";
import { redirect } from "next/navigation";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export const dynamic = "force-dynamic";

export default async function JourneysPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) redirect("/login");
  const assignedLocation = session.role === "location_manager" ? await managerLocationId(session) : null;
  const employeeScope = session.role === "location_manager" ? employeeLocationScope(assignedLocation ?? "__unassigned__") : {};

  const [tenant, params] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    searchParams,
  ]);
  const region = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const dateKey = typeof params.date === "string" && isDateKey(params.date) && params.date <= today ? params.date : today;
  const tab = params.view === "live" ? "live" : "replay";
  const { start: dayStart, end: dayEnd } = dayRangeIST(dateKey);
  const todayBounds = dayRangeIST(today);
  const from = timeZoneDayRange(dateKey, region.timeZone).start;
  const until = timeZoneDayRange(offsetDateKey(dateKey, 1), region.timeZone).end;

  const [pings, employeeCount, latestPings, attendanceRows, roster] = await Promise.all([
    tab === "replay" ? prisma.locationPing.findMany({
      where: { tenantId: session.tenantId, employee: employeeScope, at: { gte: from, lt: until } },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, shift: true } } },
    }) : [],
    tab === "replay" ? prisma.employee.count({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...employeeScope },
    }) : 0,
    prisma.locationPing.findMany({
      where: { tenantId: session.tenantId, employee: { ...employeeScope, status: "active", loginOnly: false }, at: { gte: new Date(Date.now() - 10 * 60 * 1000), lte: new Date() } },
      distinct: ["employeeId"],
      orderBy: [{ at: "desc" }, { id: "desc" }],
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true } } },
    }),
    tab === "replay" ? prisma.attendance.findMany({
       where: { tenantId: session.tenantId, employee: employeeScope, date: { gte: dayStart, lt: dayEnd } },
      select: { employeeId: true, punchInTime: true, punchOutTime: true, shift: true },
    }) : [],
    tab === "replay" ? prisma.rosterAssignment.findMany({
      where: { tenantId: session.tenantId, employee: employeeScope, date: dayStart },
      select: { employeeId: true, shift: true },
    }) : [],
  ]);

  const byEmployee = new Map<string, (typeof pings)[number][]>();
  for (const p of pings) {
    if (!byEmployee.has(p.employeeId)) byEmployee.set(p.employeeId, []);
    byEmployee.get(p.employeeId)!.push(p);
  }

  const recordByEmployee = new Map(attendanceRows.map((r) => [r.employeeId, r]));

  const rosterByEmployee = new Map(roster.map((entry) => [entry.employeeId, entry.shift]));
  const journeys = [...byEmployee.entries()].flatMap(([empId, list]) => {
    const employee = list[0].employee;
    const record = recordByEmployee.get(empId);
    if (!record?.punchInTime) return [];
    const punchedIn = record.punchInTime;
    const window = shiftWindow(dayStart, record?.shift ?? rosterByEmployee.get(empId) ?? employee.shift, region.timeZone);
    const dutyPoints = clipToDuty(
      list.filter((p) => p.at >= punchedIn && (!record.punchOutTime || p.at <= record.punchOutTime)).map((p) => ({ lat: p.lat, lng: p.lng, at: p.at.toISOString(), accuracy: p.accuracy })),
      record,
      window
    );
    if (!dutyPoints.length) return [];
    return [{
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeNumber: employee.employeeNumber,
        position: employee.position,
      },
      pingCount: dutyPoints.length,
      distanceKm: Math.round(pathDistanceKm(dutyPoints) * 100) / 100,
      startAt: dutyPoints[0].at,
      endAt: dutyPoints[dutyPoints.length - 1].at,
      points: dutyPoints,
    }];
  });

  const liveIds = latestPings.map((ping) => ping.employeeId);
  const [liveSessions, pendingOuts] = liveIds.length ? await Promise.all([
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, employeeId: { in: liveIds }, date: { gte: new Date(todayBounds.start.getTime() - 86400000), lt: todayBounds.end }, punchInTime: { not: null } }, select: { employeeId: true, punchInTime: true, punchOutTime: true }, orderBy: { punchInTime: "desc" } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, employeeId: { in: liveIds }, authStatus: "pending", inOutHint: "out", punchTime: { gte: timeZoneDayRange(offsetDateKey(today, -1), region.timeZone).start, lt: new Date() } }, select: { employeeId: true, punchTime: true } }),
  ]) : [[], []];
  const live = latestPings.filter(p => {
    const record = liveSessions.find(record => record.employeeId === p.employeeId && record.punchInTime && record.punchInTime <= p.at);
    return record?.punchInTime && !record.punchOutTime && !pendingOuts.some(out => out.employeeId === p.employeeId && out.punchTime >= record.punchInTime!);
  }).map((p) => ({
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

  return (
    <JourneysPanel
      date={dateKey}
      today={today}
      tab={tab}
      region={region}
      journeys={journeys.map((j) => ({ ...j, points: j.points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at, accuracy: p.accuracy ?? null })) }))}
      live={live}
      employeeCount={employeeCount}
    />
  );
}
