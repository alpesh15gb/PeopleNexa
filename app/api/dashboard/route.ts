import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dayRangeIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { employeeLocationScope } from "@/lib/location-scope";
import { getTenantAccess } from "@/lib/modules-server";
import { tallyDailyAttendance } from "@/lib/attendance-tally";
import { authorizedPunchDayFilter, dailyPresentEmployeeCounts } from "@/lib/attendance-presence";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, offsetDateKey, timeZoneDayRange } from "@/lib/workspace-time";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenantId = session.tenantId;
  const [{ modules }, tenant] = await Promise.all([
    getTenantAccess(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } }),
  ]);
  const { timeZone } = workspaceRegion(tenant?.config);
  const toPunchDateKey = (date: Date) => dateKeyInTimeZone(date, timeZone);
  const todayKey = toPunchDateKey(new Date());
  const month = todayKey.slice(0, 7);
  const { start, end } = dayRangeIST(todayKey);
  const range = { gte: start, lt: end };
  const canReadAttendance = modules.has("attendance");
  const canReadLeave = modules.has("leaves");

  if (session.role === "admin" || session.role === "branch_manager" || session.role === "location_manager") {
    const manager = session.role === "admin" ? null : await prisma.employee.findFirst({
      where: { id: session.sub, tenantId },
      select: { branchId: true, locationId: true },
    });
    const branchId = session.role === "branch_manager" ? manager?.branchId : null;
    const locationId = session.role === "location_manager" ? manager?.locationId : null;
    if (session.role === "branch_manager" && !branchId) return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

    const people = {
      tenantId, status: "active", loginOnly: false,
      ...(branchId ? { branchId } : {}),
      ...(locationId ? employeeLocationScope(locationId) : {}),
    };
    const attendanceScope = { tenantId, employee: people };
    const pendingScope = { ...attendanceScope, status: "pending" };
    const firstDay = offsetDateKey(todayKey, -6);
    const weekStart = dayRangeIST(firstDay).start;
    const weekPunchStart = timeZoneDayRange(firstDay, timeZone).start;
    const todayPunchWindow = timeZoneDayRange(todayKey, timeZone);

    const [employees, attendance, departments, pendingLeaves, pendingCount, approvedLeaves, weekRecords, weekPunches] = await Promise.all([
      modules.has("employees") || canReadAttendance
        ? prisma.employee.findMany({ where: people, select: { id: true } })
        : [],
      canReadAttendance ? prisma.attendance.findMany({
        where: { ...attendanceScope, date: range },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }) : [],
      modules.has("employees") ? prisma.department.findMany({
        where: { tenantId },
        include: { _count: { select: { employees: { where: people } } } },
      }) : [],
      canReadLeave ? prisma.leaveRequest.findMany({
        where: pendingScope,
        include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
        orderBy: [{ appliedAt: "desc" }, { id: "asc" }],
        take: 10,
      }) : [],
      canReadLeave ? prisma.leaveRequest.count({ where: pendingScope }) : 0,
      canReadLeave ? prisma.leaveRequest.findMany({
        where: { ...attendanceScope, status: "approved", fromDate: { lt: end }, toDate: { gte: start } },
        select: { employeeId: true },
      }) : [],
      canReadAttendance ? prisma.attendance.findMany({
        where: { ...attendanceScope, date: { gte: weekStart, lt: end } },
        select: { employeeId: true, date: true, status: true },
      }) : [],
      canReadAttendance ? prisma.punch.findMany({
        where: { ...attendanceScope, ...authorizedPunchDayFilter(weekPunchStart, todayPunchWindow.end) },
        select: { employeeId: true, punchTime: true, authStatus: true, employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
        orderBy: [{ punchTime: "asc" }, { id: "asc" }],
      }) : [],
    ]);

    const todayPunches = weekPunches.filter((punch) => punch.punchTime >= todayPunchWindow.start);
    const counts = tallyDailyAttendance(employees.map((person) => person.id), attendance, approvedLeaves.map((leave) => leave.employeeId), todayPunches.map((punch) => punch.employeeId));
    const withRecord = new Set(attendance.map((record) => record.employeeId));
    const earlyPunches = [];
    for (const punch of todayPunches) {
      if (withRecord.has(punch.employeeId)) continue;
      withRecord.add(punch.employeeId);
      earlyPunches.push({
        id: `punch-${punch.employeeId}`, employeeId: punch.employeeId, punchInTime: punch.punchTime,
        punchOutTime: null, status: "present", employee: punch.employee,
      });
    }

    const presentByDay = dailyPresentEmployeeCounts(weekRecords, weekPunches, toPunchDateKey);
    const week = canReadAttendance ? Array.from({ length: 7 }, (_, index) => {
      const day = offsetDateKey(firstDay, index);
      const records = weekRecords.filter((record) => istDateKey(record.date) === day);
      const late = records.filter((record) => record.status === "late").length;
      return { day, present: presentByDay.get(day) ?? 0, late, absent: records.filter((record) => record.status === "absent").length };
    }) : [];

    return NextResponse.json({
      summary: {
        totalEmployees: modules.has("employees") ? counts.total : 0,
        present: counts.livePresent, late: counts.late, permission: counts.permission, absent: counts.absent,
        halfDay: counts.halfDay, onLeave: counts.onLeave, noRecord: canReadAttendance ? counts.noRecord : 0,
        pendingLeaves: pendingCount,
      },
      departments: departments.map((department) => ({ name: department.name, count: department._count.employees })),
      attendance: [...attendance, ...earlyPunches],
      week,
      pendingLeaves,
    });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId },
    select: { id: true, shift: true, branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const self = { employeeId: employee.id, tenantId };
  const [todayRecord, monthCount, balances, pendingRequests] = await Promise.all([
    canReadAttendance ? prisma.attendance.findFirst({ where: { ...self, date: range }, orderBy: { date: "desc" } }) : null,
    canReadAttendance ? prisma.attendance.count({ where: { ...self, date: { gte: dayRangeIST(`${month}-01`).start, lt: end } } }) : 0,
    canReadLeave ? prisma.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { ...self, status: { in: ["approved", "pending"] } },
      _count: true,
    }) : [],
    canReadLeave ? prisma.leaveRequest.findMany({
      where: { ...self, status: "pending" },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }) : [],
  ]);

  return NextResponse.json({
    today: { date: todayKey, record: todayRecord, shift: employee.shift, branch: employee.branch, month, monthCount },
    balances: balances.map((balance) => ({ leaveTypeId: balance.leaveTypeId, status: balance.status, used: balance._count })),
    pendingRequests,
  });
}
