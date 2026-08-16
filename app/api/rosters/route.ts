import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, toDateKey, addDays, startOfDay, daysBetween } from "@/lib/dates";
import { istStartOfDay } from "@/lib/ist";

/** GET — assignments for a week (or date range) + employees + shifts for the UI. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const from = req.nextUrl.searchParams.get("from") || toDateKey(startOfDay(new Date()));
  const to = req.nextUrl.searchParams.get("to") || from;
  const fromDay = istStartOfDay(fromDateKey(from));
  const toDay = istStartOfDay(fromDateKey(to));

  const [assignments, employees, shifts] = await Promise.all([
    prisma.rosterAssignment.findMany({
      where: { tenantId: session.tenantId, date: { gte: fromDay, lte: toDay } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } }, shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, department: { select: { id: true, name: true } }, shift: { select: { id: true, name: true } } },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.shift.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, startTime: true, endTime: true, isNightShift: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  return NextResponse.json({
    from: toDateKey(fromDay),
    to: toDateKey(toDay),
    assignments: assignments.map((a) => ({
      id: a.id,
      date: toDateKey(a.date),
      employeeId: a.employeeId,
      employee: a.employee,
      shift: a.shift,
    })),
    employees: employees.map((e) => ({ ...e })),
    shifts,
  });
}

/** POST — bulk-assign a shift to employees or a whole department for a date range. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const shiftId = String(body.shiftId ?? "");
  const dateFrom = fromDateKey(String(body.dateFrom ?? ""));
  const dateTo = fromDateKey(String(body.dateTo ?? ""));
  const overwrite = Boolean(body.overwrite);

  if (!shiftId) return NextResponse.json({ error: "Select a shift." }, { status: 400 });
  if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime()) || dateTo < dateFrom) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const days = daysBetween(dateFrom, dateTo);
  if (days > 31) return NextResponse.json({ error: "Max 31 days per bulk assignment." }, { status: 400 });

  let employeeIds: string[] = [];
  if (Array.isArray(body.employeeIds) && body.employeeIds.length > 0) {
    employeeIds = body.employeeIds.map(String);
  } else if (body.departmentId) {
    const emps = await prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", departmentId: body.departmentId },
      select: { id: true },
    });
    employeeIds = emps.map((e) => e.id);
  }
  if (employeeIds.length === 0) return NextResponse.json({ error: "Select employees or a department." }, { status: 400 });

  // Validate that every employee belongs to this tenant (avoid FK errors).
  const validEmps = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId: session.tenantId },
    select: { id: true },
  });
  const validIds = new Set(validEmps.map((e) => e.id));
  employeeIds = employeeIds.filter((id) => validIds.has(id));
  if (employeeIds.length === 0) return NextResponse.json({ error: "Select valid employees from this workspace." }, { status: 400 });

  const shift = await prisma.shift.findFirst({ where: { id: shiftId, tenantId: session.tenantId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });

  // Pre-fetch existing assignments in range to report clashes.
  const fromDay = istStartOfDay(dateFrom);
  const toDay = istStartOfDay(dateTo);
  const existing = await prisma.rosterAssignment.findMany({
    where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, date: { gte: fromDay, lte: toDay } },
    select: { employeeId: true, date: true },
  });
  const clashKeys = new Set(existing.map((e) => `${e.employeeId}|${toDateKey(e.date)}`));

  let created = 0;
  let clashes = 0;
  for (const employeeId of employeeIds) {
    for (let d = new Date(fromDay); d <= toDay; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
      const key = `${employeeId}|${toDateKey(d)}`;
      if (clashKeys.has(key) && !overwrite) {
        clashes++;
        continue;
      }
      await prisma.rosterAssignment.upsert({
        where: { tenantId_employeeId_date: { tenantId: session.tenantId, employeeId, date: d } },
        update: { shiftId },
        create: { tenantId: session.tenantId, employeeId, shiftId, date: d, createdBy: session.sub },
      });
      created++;
    }
  }

  return NextResponse.json({ success: true, created, clashes, days, employees: employeeIds.length });
}
