import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, endOfDay, toDateKey, addDays, daysBetween } from "@/lib/dates";

const COLORS: Record<string, string> = {
  present: "#34d399",
  late: "#fbbf24",
  permission: "#38bdf8",
  absent: "#fb7185",
  half_day: "#a78bfa",
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const type = params.get("type") || "daily";
  const from = params.get("from") || toDateKey(addDays(new Date(), -29));
  const to = params.get("to") || toDateKey(new Date());
  const departmentId = params.get("departmentId") || undefined;

  const fromDate = fromDateKey(from);
  const toDate = fromDateKey(to);
  if (toDate < fromDate) return NextResponse.json({ error: "Invalid date range." }, { status: 400 });

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
  ]);

  const days: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) days.push(toDateKey(d));

  const leaveByDate = new Map<string, Map<string, { type: string; color: string }>>();
  for (const l of leaves) {
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) {
      const key = toDateKey(d);
      if (!leaveByDate.has(key)) leaveByDate.set(key, new Map());
      leaveByDate.get(key)!.set(l.employee.id, { type: l.leaveType.name, color: l.leaveType.color });
    }
  }

  // ── Daily: per-day status counts ─────────────────────────────────────────
  if (type === "daily") {
    const rows = days.map((day) => {
      const dayLeaves = leaveByDate.get(day);
      const onLeave = dayLeaves ? dayLeaves.size : 0;
      const present = records.filter((r) => toDateKey(r.date) === day && r.status === "present").length;
      const late = records.filter((r) => toDateKey(r.date) === day && r.status === "late").length;
      const permission = records.filter((r) => toDateKey(r.date) === day && r.status === "permission").length;
      const halfDay = records.filter((r) => toDateKey(r.date) === day && r.status === "half_day").length;
      const absent = Math.max(employees.length - onLeave - present - late - permission - halfDay, 0);
      return { day, present, late, permission, halfDay, absent, onLeave };
    });
    return NextResponse.json({ type, days: rows, summary: rows[rows.length - 1] });
  }

  // ── Monthly: per-employee totals ─────────────────────────────────────────
  if (type === "monthly") {
    const rows = employees.map((emp) => {
      const empRecords = records.filter((r) => r.employee.id === emp.id);
      const empLeaves = leaves.filter((l) => l.employee.id === emp.id);
      const totals = {
        present: empRecords.filter((r) => r.status === "present").length,
        late: empRecords.filter((r) => r.status === "late").length,
        permission: empRecords.filter((r) => r.status === "permission").length,
        half_day: empRecords.filter((r) => r.status === "half_day").length,
        onLeave: empLeaves.reduce((s, l) => s + l.days, 0),
        lateMinutes: empRecords.reduce((s, r) => s + r.lateMinutes, 0),
      };
      totals.present = empRecords.filter((r) => r.status === "present" || r.status === "half_day").length;
      const absent = Math.max(days.length - totals.present - totals.late - totals.permission - totals.onLeave, 0);
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
        date: toDateKey(r.date),
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
    const key = toDateKey(r.date);
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
      const short = status === "half_day" ? "HD" : status === "permission" ? "P" : status === "late" ? "LT" : "P";
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
