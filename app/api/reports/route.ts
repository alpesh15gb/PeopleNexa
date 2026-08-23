import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, endOfDay, toDateKey, addDays } from "@/lib/dates";
import { dateInRange, getWorkCalendarConfig, isAfterLastWorkingDay, isBeforeJoining, isWeeklyOff } from "@/lib/work-calendar";

const COLORS: Record<string, string> = {
  present: "#34d399",
  late: "#fbbf24",
  permission: "#38bdf8",
  absent: "#fb7185",
  half_day: "#a78bfa",
  leave: "#60a5fa",
  non_working: "#64748b",
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const type = params.get("type") || "daily";
  const from = params.get("from") || toDateKey(addDays(new Date(), -29));
  const to = params.get("to") || toDateKey(new Date());
  const departmentId = params.get("departmentId") || undefined;

  let fromDate: Date;
  let toDate: Date;
  try {
    fromDate = fromDateKey(from);
    toDate = fromDateKey(to);
  } catch {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  if (toDate < fromDate) return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 366) {
    return NextResponse.json({ error: "Reports are limited to 367 days per request." }, { status: 400 });
  }

  const employeeWhere = {
    tenantId: session.tenantId,
    ...(departmentId ? { departmentId } : {}),
    OR: [{ joiningDate: null }, { joiningDate: { lte: endOfDay(toDate) } }],
  };

  const [tenant, employees, records, leaves, holidays, exits] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        status: true,
        department: { select: { name: true } },
        shift: { select: { name: true, startTime: true } },
        joiningDate: true,
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: fromDate, lte: endOfDay(toDate) },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        shift: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lte: endOfDay(toDate) },
        toDate: { gte: fromDate },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
    prisma.holiday.findMany({
      where: { tenantId: session.tenantId, date: { gte: fromDate, lte: endOfDay(toDate) } },
      select: { date: true, name: true, isHalfDay: true },
    }),
    prisma.exitRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: { in: ["approved", "completed"] },
        employeeId: { in: [] },
      },
      select: { employeeId: true, lastWorkingDay: true },
    }).catch(() => []),
  ]);

  // Prisma cannot inject employee ids before the parallel query above. Fetch
  // exits in a second bounded query; report size is already capped to one year.
  const realExits = employees.length
    ? await prisma.exitRequest.findMany({
        where: { tenantId: session.tenantId, status: { in: ["approved", "completed"] }, employeeId: { in: employees.map((e) => e.id) } },
        select: { employeeId: true, lastWorkingDay: true },
        orderBy: { lastWorkingDay: "desc" },
      })
    : exits;
  const exitByEmployee = new Map<string, Date>();
  for (const exit of realExits) if (!exitByEmployee.has(exit.employeeId)) exitByEmployee.set(exit.employeeId, exit.lastWorkingDay);

  const days: Date[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) days.push(d);
  const dayKeys = days.map(toDateKey);
  const workCalendar = getWorkCalendarConfig(tenant?.config ?? null);
  const holidayByDay = new Map(holidays.map((h) => [toDateKey(h.date), h]));

  const recordIndex = new Map<string, Map<string, (typeof records)[number]>>();
  for (const r of records) {
    const key = toDateKey(r.date);
    if (!recordIndex.has(key)) recordIndex.set(key, new Map());
    recordIndex.get(key)!.set(r.employee.id, r);
  }

  const leaveByDate = new Map<string, Map<string, { type: string; color: string }>>();
  for (const l of leaves) {
    for (const day of days) {
      if (!dateInRange(day, l.fromDate, l.toDate)) continue;
      const key = toDateKey(day);
      if (!leaveByDate.has(key)) leaveByDate.set(key, new Map());
      leaveByDate.get(key)!.set(l.employee.id, { type: l.leaveType.name, color: l.leaveType.color });
    }
  }

  const scheduled = (emp: (typeof employees)[number], day: Date) => {
    if (isBeforeJoining(day, emp.joiningDate) || isAfterLastWorkingDay(day, exitByEmployee.get(emp.id))) return false;
    if (isWeeklyOff(day, workCalendar)) return false;
    const holiday = holidayByDay.get(toDateKey(day));
    return !holiday || holiday.isHalfDay;
  };

  if (type === "daily") {
    const rows = days.map((day) => {
      const key = toDateKey(day);
      let scheduledEmployees = 0;
      let present = 0;
      let late = 0;
      let permission = 0;
      let halfDay = 0;
      let onLeave = 0;
      let absent = 0;
      for (const emp of employees) {
        if (!scheduled(emp, day)) continue;
        scheduledEmployees++;
        const leave = leaveByDate.get(key)?.get(emp.id);
        if (leave) {
          onLeave++;
          continue;
        }
        const rec = recordIndex.get(key)?.get(emp.id);
        if (!rec || rec.status === "absent") {
          absent++;
          continue;
        }
        present++;
        if (rec.status === "late") late++;
        if (rec.status === "permission") permission++;
        if (rec.status === "half_day") halfDay++;
      }
      return { day: key, scheduled: scheduledEmployees, present, late, permission, halfDay, absent, onLeave };
    });
    return NextResponse.json({ type, days: rows, summary: rows[rows.length - 1] ?? null });
  }

  if (type === "monthly") {
    const rows = employees.map((emp) => {
      const totals = { present: 0, late: 0, permission: 0, half_day: 0, onLeave: 0, lateMinutes: 0 };
      let absent = 0;
      let workDays = 0;
      for (const day of days) {
        if (!scheduled(emp, day)) continue;
        workDays++;
        const key = toDateKey(day);
        if (leaveByDate.get(key)?.has(emp.id)) {
          totals.onLeave++;
          continue;
        }
        const rec = recordIndex.get(key)?.get(emp.id);
        if (!rec || rec.status === "absent") {
          absent++;
          continue;
        }
        if (rec.status === "present") totals.present++;
        else if (rec.status === "late") totals.late++;
        else if (rec.status === "permission") totals.permission++;
        else if (rec.status === "half_day") totals.half_day++;
        totals.lateMinutes += rec.lateMinutes;
      }
      return { employee: emp, ...totals, absent, workDays };
    });
    return NextResponse.json({ type, from, to, days: dayKeys.length, rows });
  }

  if (type === "late") {
    const lateRecords = records.filter((r) => r.status === "late").sort((a, b) => b.lateMinutes - a.lateMinutes);
    return NextResponse.json({
      type,
      rows: lateRecords.map((r) => ({
        id: r.id,
        date: toDateKey(r.date),
        employee: { id: r.employee.id, name: `${r.employee.firstName} ${r.employee.lastName}` },
        lateMinutes: r.lateMinutes,
        shiftName: r.shift?.name ?? null,
      })),
      total: lateRecords.length,
      avgLateMinutes: lateRecords.length ? Math.round(lateRecords.reduce((s, r) => s + r.lateMinutes, 0) / lateRecords.length) : 0,
    });
  }

  const matrix = employees.map((emp) => ({
    employee: emp,
    cells: days.map((day) => {
      const key = toDateKey(day);
      if (isBeforeJoining(day, emp.joiningDate)) return { key: "—", color: COLORS.non_working, tooltip: "Not joined" };
      if (isAfterLastWorkingDay(day, exitByEmployee.get(emp.id))) return { key: "—", color: COLORS.non_working, tooltip: "After last working day" };
      const holiday = holidayByDay.get(key);
      if (holiday && !holiday.isHalfDay) return { key: "H", color: COLORS.non_working, tooltip: holiday.name };
      if (isWeeklyOff(day, workCalendar)) return { key: "WO", color: COLORS.non_working, tooltip: "Weekly off" };
      const onLeave = leaveByDate.get(key)?.get(emp.id);
      if (onLeave) return { key: "L", color: onLeave.color, tooltip: onLeave.type };
      const status = recordIndex.get(key)?.get(emp.id)?.status;
      if (!status || status === "absent") return { key: "A", color: COLORS.absent, tooltip: "Absent" };
      const short = status === "half_day" ? "HD" : status === "permission" ? "P" : status === "late" ? "LT" : "P";
      return { key: short, color: COLORS[status] ?? COLORS.present, tooltip: status };
    }),
  }));

  return NextResponse.json({ type: "matrix", from, to, days: dayKeys, rows: matrix, legend: COLORS });
}
