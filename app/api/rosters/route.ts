import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istDateKey, parseIST } from "@/lib/ist";

const DATE_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Parse "YYYY-MM-DD" as an IST midnight UTC instant. Null on invalid/overflow. */
function parseDateKeyAsIST(key: string): Date | null {
  if (!DATE_KEY_RE.test(key)) return null;
  const d = parseIST(`${key} 00:00:00`);
  if (!d || isNaN(d.getTime())) return null;
  // Guard overflow (e.g. 2026-02-30 → Mar 02).
  if (istDateKey(d) !== key) return null;
  return d;
}

/** GET — assignments for a week (or date range) + employees + shifts for the UI. */
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fromKey = req.nextUrl.searchParams.get("from") || istDateKey(new Date());
  const toKey = req.nextUrl.searchParams.get("to") || fromKey;
  const fromDay = parseDateKeyAsIST(fromKey);
  const toDay = parseDateKeyAsIST(toKey);
  if (!fromDay || !toDay || toDay < fromDay) {
    return NextResponse.json({ error: "Invalid date range. Use YYYY-MM-DD." }, { status: 400 });
  }

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
    from: istDateKey(fromDay),
    to: istDateKey(toDay),
    assignments: assignments.map((a) => ({
      id: a.id,
      date: istDateKey(a.date),
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
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const shiftId = String(body.shiftId ?? "");
  const fromDay = parseDateKeyAsIST(String(body.dateFrom ?? ""));
  const toDay = parseDateKeyAsIST(String(body.dateTo ?? ""));
  const overwrite = Boolean(body.overwrite);

  if (!shiftId) return NextResponse.json({ error: "Select a shift." }, { status: 400 });
  if (!fromDay || !toDay || toDay < fromDay) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const days = Math.round((toDay.getTime() - fromDay.getTime()) / 86400000) + 1;
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
  const existing = await prisma.rosterAssignment.findMany({
    where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, date: { gte: fromDay, lte: toDay } },
    select: { employeeId: true, date: true },
  });
  const clashKeys = new Set(existing.map((e) => `${e.employeeId}|${istDateKey(e.date)}`));

  // Collect all (employeeId, date) targets first; respect overwrite for clashes.
  const targets: { employeeId: string; date: Date }[] = [];
  let clashes = 0;
  for (const employeeId of employeeIds) {
    for (let d = new Date(fromDay); d <= toDay; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
      const key = `${employeeId}|${istDateKey(d)}`;
      if (clashKeys.has(key) && !overwrite) {
        clashes++;
        continue;
      }
      targets.push({ employeeId, date: new Date(d) });
    }
  }

  // Leave/holiday conflict warnings (don't block — report only).
  // Holiday/leave dates may be stored as local-midnight instants, so pad the
  // query window by a day and compare via IST date keys.
  const padDay = 24 * 3600 * 1000;
  const looseFrom = new Date(fromDay.getTime() - padDay);
  const looseTo = new Date(toDay.getTime() + padDay);
  const [holidays, approvedLeaves] = await Promise.all([
    prisma.holiday.findMany({
      where: { tenantId: session.tenantId, date: { gte: looseFrom, lte: looseTo } },
      select: { date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        employeeId: { in: employeeIds },
        fromDate: { lte: looseTo },
        toDate: { gte: looseFrom },
      },
      select: { employeeId: true, fromDate: true, toDate: true },
    }),
  ]);
  const holidayKeys = new Set(holidays.map((h) => istDateKey(h.date)));
  const leavesByEmp = new Map<string, { start: string; end: string }[]>();
  for (const l of approvedLeaves) {
    const start = istDateKey(l.fromDate);
    const end = istDateKey(l.toDate);
    if (!leavesByEmp.has(l.employeeId)) leavesByEmp.set(l.employeeId, []);
    leavesByEmp.get(l.employeeId)!.push({ start, end });
  }
  let leaveConflicts = 0;
  let holidayConflicts = 0;
  for (const t of targets) {
    const key = istDateKey(t.date);
    if (holidayKeys.has(key)) holidayConflicts++;
    const ranges = leavesByEmp.get(t.employeeId);
    if (ranges?.some((r) => key >= r.start && key <= r.end)) leaveConflicts++;
  }

  // Batched upserts: chunk targets to keep each transaction small.
  const CHUNK_SIZE = 50;
  let created = 0;
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((t) =>
        prisma.rosterAssignment.upsert({
          where: { tenantId_employeeId_date: { tenantId: session.tenantId, employeeId: t.employeeId, date: t.date } },
          update: { shiftId },
          create: { tenantId: session.tenantId, employeeId: t.employeeId, shiftId, date: t.date, createdBy: session.sub },
        })
      )
    );
    created += chunk.length;
  }

  const warnings: string[] = [];
  if (leaveConflicts > 0) warnings.push(`${leaveConflicts} assignment(s) overlap approved leave.`);
  if (holidayConflicts > 0) warnings.push(`${holidayConflicts} assignment(s) fall on holidays.`);

  return NextResponse.json({
    success: true,
    created,
    clashes,
    days,
    employees: employeeIds.length,
    leaveConflicts,
    holidayConflicts,
    warnings,
  });
}

/** DELETE — remove assignments for employees over a date range. */
export async function DELETE(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const q = req.nextUrl.searchParams;

  const rawIds: unknown =
    body.employeeIds ?? body.employeeId ?? q.getAll("employeeIds").flatMap((v) => v.split(","));
  let employeeIds: string[] = [];
  if (Array.isArray(rawIds)) employeeIds = rawIds.map(String).filter(Boolean);
  else if (typeof rawIds === "string" && rawIds) employeeIds = [rawIds];
  if (q.get("employeeId")) employeeIds.push(String(q.get("employeeId")));

  const fromRaw = String(body.dateFrom ?? body.from ?? q.get("from") ?? "");
  const toRaw = String(body.dateTo ?? body.to ?? q.get("to") ?? fromRaw);
  const fromDay = parseDateKeyAsIST(fromRaw);
  const toDay = parseDateKeyAsIST(toRaw || fromRaw);

  if (employeeIds.length === 0) return NextResponse.json({ error: "Select employees." }, { status: 400 });
  if (!fromDay || !toDay || toDay < fromDay) {
    return NextResponse.json({ error: "Invalid date range. Use YYYY-MM-DD." }, { status: 400 });
  }

  const validEmps = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId: session.tenantId },
    select: { id: true },
  });
  const validIds = validEmps.map((e) => e.id);
  if (validIds.length === 0) return NextResponse.json({ error: "Select valid employees from this workspace." }, { status: 400 });

  const result = await prisma.rosterAssignment.deleteMany({
    where: { tenantId: session.tenantId, employeeId: { in: validIds }, date: { gte: fromDay, lte: toDay } },
  });
  return NextResponse.json({ success: true, deleted: result.count });
}
