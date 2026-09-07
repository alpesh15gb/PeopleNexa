import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istDateKey, istStartOfDay, parseIST } from "@/lib/ist";

const COLORS: Record<string, string> = {
  present: "#34d399",
  late: "#fbbf24",
  permission: "#38bdf8",
  absent: "#fb7185",
  half_day: "#a78bfa",
};

const KNOWN_TYPES = new Set(["daily", "monthly", "late", "matrix"]);

function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parsed = parseIST(`${key} 00:00:00`);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return istDateKey(parsed) === key;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const type = params.get("type") || "daily";

  if (!KNOWN_TYPES.has(type)) {
    return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
  }

  const todayIST = istDateKey(new Date());
  const todayStart = parseIST(`${todayIST} 00:00:00`)!;
  const defaultTo = todayIST;
  const defaultFrom = istDateKey(new Date(todayStart.getTime() - 29 * 86400000));
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const departmentId = params.get("departmentId") || undefined;

  if (!isValidDateKey(from) || !isValidDateKey(to)) {
    return NextResponse.json({ error: "Invalid date range. Use YYYY-MM-DD dates." }, { status: 400 });
  }
  const rangeStart = parseIST(`${from} 00:00:00`)!;
  const toStart = parseIST(`${to} 00:00:00`)!;
  if (toStart < rangeStart) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const rangeDays = Math.round((toStart.getTime() - rangeStart.getTime()) / 86400000) + 1;
  if (rangeDays > 366) {
    return NextResponse.json({ error: "Date range too large. Select at most 366 days." }, { status: 400 });
  }
  const rangeEndExclusive = new Date(toStart.getTime() + 86400000);

  const employeeWhere = {
    tenantId: session.tenantId,
    status: "active",
    ...(departmentId ? { departmentId } : {}),
  };

  const [employees, records, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        shift: { select: { name: true, startTime: true } },
        joiningDate: true,
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: rangeStart, lt: rangeEndExclusive },
        employee: { status: "active", ...(departmentId ? { departmentId } : {}) },
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
        fromDate: { lt: rangeEndExclusive },
        toDate: { gte: rangeStart },
        employee: { status: "active", ...(departmentId ? { departmentId } : {}) },
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
  ]);

  // IST day keys for the selected range (inclusive).
  const days: string[] = [];
  for (let n = 0; n < rangeDays; n++) {
    days.push(istDateKey(new Date(rangeStart.getTime() + n * 86400000)));
  }

  // Leave lookup clipped to the selected range (IST day granularity).
  const leaveByDate = new Map<string, Map<string, { type: string; color: string }>>();
  for (const l of leaves) {
    const lStart = istStartOfDay(l.fromDate);
    const lEnd = istStartOfDay(l.toDate);
    for (let n = 0; n < rangeDays; n++) {
      const dayStart = new Date(rangeStart.getTime() + n * 86400000);
      if (lStart.getTime() <= dayStart.getTime() && lEnd.getTime() >= dayStart.getTime()) {
        const key = days[n];
        if (!leaveByDate.has(key)) leaveByDate.set(key, new Map());
        leaveByDate.get(key)!.set(l.employee.id, { type: l.leaveType.name, color: l.leaveType.color });
      }
    }
  }

  function clippedOnLeaveDays(empId: string): number {
    let count = 0;
    for (const day of days) {
      if (leaveByDate.get(day)?.has(empId)) count++;
    }
    return count;
  }

  // ── Daily: per-day status counts ─────────────────────────────────────────
  if (type === "daily") {
    const rows = days.map((day) => {
      const dayLeaves = leaveByDate.get(day);
      const onLeave = dayLeaves ? dayLeaves.size : 0;
      const present = records.filter((r) => istDateKey(r.date) === day && r.status === "present").length;
      const late = records.filter((r) => istDateKey(r.date) === day && r.status === "late").length;
      const permission = records.filter((r) => istDateKey(r.date) === day && r.status === "permission").length;
      const halfDay = records.filter((r) => istDateKey(r.date) === day && r.status === "half_day").length;
      const absent = Math.max(employees.length - onLeave - present - late - permission - halfDay, 0);
      return { day, present, late, permission, halfDay, absent, onLeave };
    });
    return NextResponse.json({ type, days: rows, summary: rows[rows.length - 1] });
  }

  // ── Monthly: per-employee totals ─────────────────────────────────────────
  if (type === "monthly") {
    const rows = employees.map((emp) => {
      const empRecords = records.filter((r) => r.employee.id === emp.id);
      const totals = {
        present: empRecords.filter((r) => r.status === "present").length,
        late: empRecords.filter((r) => r.status === "late").length,
        permission: empRecords.filter((r) => r.status === "permission").length,
        half_day: empRecords.filter((r) => r.status === "half_day").length,
        onLeave: clippedOnLeaveDays(emp.id),
        lateMinutes: empRecords.reduce((s, r) => s + r.lateMinutes, 0),
      };
      const absent = Math.max(days.length - totals.present - totals.late - totals.permission - totals.half_day - totals.onLeave, 0);
      return {
        employee: emp,
        ...totals,
        absent,
        workDays: days.length,
      };
    });
    return NextResponse.json({ type, from, to, days: days.length, rows });
  }

  // ── Late-comers ──────────────────────────────────────────────────────────
  if (type === "late") {
    const lateRecords = records
      .filter((r) => r.status === "late")
      .sort((a, b) => b.lateMinutes - a.lateMinutes);
    return NextResponse.json({
      type,
      rows: lateRecords.map((r) => ({
        id: r.id,
        date: istDateKey(r.date),
        employee: { id: r.employee.id, name: `${r.employee.firstName} ${r.employee.lastName}` },
        lateMinutes: r.lateMinutes,
        shiftName: r.shift?.name ?? null,
      })),
      total: lateRecords.length,
      avgLateMinutes: lateRecords.length
        ? Math.round(lateRecords.reduce((s, r) => s + r.lateMinutes, 0) / lateRecords.length)
        : 0,
    });
  }

  // ── Present / Absent matrix ──────────────────────────────────────────────
  const recordIndex = new Map<string, Map<string, string>>();
  for (const r of records) {
    const key = istDateKey(r.date);
    if (!recordIndex.has(key)) recordIndex.set(key, new Map());
    recordIndex.get(key)!.set(r.employee.id, r.status);
  }

  const matrix = employees.map((emp) => ({
    employee: emp,
    cells: days.map((day) => {
      const onLeave = leaveByDate.get(day)?.get(emp.id);
      if (onLeave) return { key: "L", color: onLeave.color, tooltip: onLeave.type };
      const status = recordIndex.get(day)?.get(emp.id);
      if (!status) return { key: "A", color: COLORS.absent, tooltip: "Absent" };
      const short = status === "half_day" ? "HD" : status === "permission" ? "PR" : status === "late" ? "LT" : "P";
      return { key: short, color: COLORS[status], tooltip: status };
    }),
  }));

  return NextResponse.json({
    type: "matrix",
    from,
    to,
    days,
    rows: matrix,
    legend: COLORS,
  });
}
