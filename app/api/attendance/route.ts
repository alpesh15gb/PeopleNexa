import { unprocessedAttendanceSourceDays } from "@/lib/attendance-source-recovery";
import { assessAttendanceDay, isAttendanceHoliday, isScheduledWeeklyOff } from "@/lib/attendance-assessment";
import { authorizedPunchDayFilter } from "@/lib/attendance-presence";
import { employeeLocationScope } from "@/lib/location-scope";
import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dayRangeIST, isDateKey, todayKey } from "@/lib/dates";
import { istStartOfDay, parseIST } from "@/lib/ist";
import { shiftForEmployeeDay } from "@/lib/reconcile";

const MANUAL_STATUSES = ["present", "late", "permission", "absent", "half_day"];

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let branchId: string | null = null;
  let locationId: string | null = null;
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) {
      return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    }
    branchId = manager.branchId;
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } });
    if (!manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    locationId = manager.locationId;
  }

  // Reads never finalize or repair attendance; the scheduled worker owns that work.

  const dateKey = req.nextUrl.searchParams.get("date") || todayKey();
  if (!isDateKey(dateKey)) return NextResponse.json({ error: "date must use a real YYYY-MM-DD calendar date." }, { status: 400 });
  const { start: dayStart, end: dayEnd } = dayRangeIST(dateKey);

  const [employees, records, leaves, holidays, punches, rosters] = await Promise.all([
    prisma.employee.findMany({
       where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}), ...(branchId ? { branchId } : {}) },
      select: {
        id: true,
        employeeNumber: true,
        deviceCode: true,
        joiningDate: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        shift: { select: { name: true, sundayWeeklyOff: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
       where: { tenantId: session.tenantId, date: { gte: dayStart, lt: dayEnd }, ...(branchId ? { employee: { branchId } } : locationId ? { employee: employeeLocationScope(locationId) } : {}) },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { name: true } },
        shift: { select: { name: true, sundayWeeklyOff: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lt: dayEnd },
        toDate: { gte: dayStart },
        ...(branchId ? { employee: { branchId } } : locationId ? { employee: employeeLocationScope(locationId) } : {}),
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId, OR: [{date: { gte: dayStart, lt: dayEnd }}, {isRecurring: true}] } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, ...authorizedPunchDayFilter(dayStart, dayEnd), employee: branchId ? { branchId } : locationId ? employeeLocationScope(locationId) : {} }, select: { employeeId: true } }),
    prisma.rosterAssignment.findMany({ where: { tenantId: session.tenantId, date: dayStart, employee: branchId ? { branchId } : locationId ? employeeLocationScope(locationId) : {} }, include: { shift: true } }),
  ]);

  const sourceRecoveryDays = await unprocessedAttendanceSourceDays(session.tenantId, employees, dayStart, dayEnd);
  const dayHolidays = holidays.filter(h => isAttendanceHoliday(dateKey, [h]));
  const rosterByEmployee = new Map(rosters.map(r => [r.employeeId, r.shift]));
  const punched = new Set(punches.map(p => p.employeeId));
  const leaveByEmployee = new Map(leaves.map((l) => [l.employee.id, l]));
  const recordByEmployee = new Map(records.map((r) => [r.employee.id, r]));

  const rows = employees.map((emp) => {
    const record = recordByEmployee.get(emp.id);
    const leave = leaveByEmployee.get(emp.id);
    return {
      employee: emp,
      record,
      leave: leave
        ? { type: leave.leaveType.name, color: leave.leaveType.color }
        : null,
      status: assessAttendanceDay({ day: dateKey, joiningDate: emp.joiningDate, record, hasShift: Boolean(rosterByEmployee.get(emp.id) ?? record?.shift ?? emp.shift), hasAuthorizedPunch: punched.has(emp.id), hasUnprocessedSource: sourceRecoveryDays.has(`${emp.id}|${dateKey}`), leave: Boolean(leave), holiday: dayHolidays.length > 0, weeklyOff: isScheduledWeeklyOff(dateKey, rosterByEmployee.get(emp.id) ?? record?.shift ?? emp.shift) }).status,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    date: dateKey,
    isHoliday: dayHolidays.length > 0,
    holidays: dayHolidays.map((h) => h.name),
    counts,
    rows,
  });
}

/** POST — admin creates a manual attendance row for a day with no punches
 * (e.g. marking an absent day that has no derived record yet). */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? "").trim();
  const dateRaw = String(body.date ?? "").trim();
  const status = String(body.status ?? "").trim();
  const note = body.note ? String(body.note).trim() : null;

  if (employeeId === session.sub) return NextResponse.json({ error: "Use an attendance correction request for your own attendance; an independent reviewer must approve it." }, { status: 403 });
  if (!note || note.length > 2000) return NextResponse.json({ error: "A reason of at most 2,000 characters is required for manual attendance." }, { status: 400 });
  if (!employeeId) return NextResponse.json({ error: "employeeId is required." }, { status: 400 });
  if (!MANUAL_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  let dayStart: Date | null = null;
  const dayMatch = dateRaw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dayMatch) {
    dayStart = parseIST(`${dayMatch[1]} 00:00:00`);
  } else if (dateRaw) {
    const parsed = parseIST(dateRaw);
    dayStart = parsed ? istStartOfDay(parsed) : null;
  }
  if (!dayStart || isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  const now = new Date();
  if (dayStart.getTime() > istStartOfDay(now).getTime()) {
    return NextResponse.json({ error: "Cannot create attendance for a future date." }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: session.tenantId },
    select: { id: true, tenantId: true, status: true, joiningDate: true, branchId: true, shiftId: true, branch: { select: { locationId: true } } },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId || employee.branchId !== manager.branchId) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } });
    if (!manager?.locationId || employee.branch?.locationId !== manager.locationId) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Only active employees can be marked." }, { status: 403 });
  }
  if (employee.joiningDate) {
    const joinStart = istStartOfDay(new Date(employee.joiningDate));
    if (dayStart.getTime() < joinStart.getTime()) {
      return NextResponse.json({ error: "Cannot create attendance before the joining date." }, { status: 400 });
    }
  }

  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const existing = await prisma.attendance.findFirst({
    where: { employeeId, date: { gte: dayStart, lt: dayEnd } },
  });
  if (existing) {
    return NextResponse.json({ error: "An attendance record already exists for this day." }, { status: 409 });
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      await assertLeavePayrollOpen(tx, session.tenantId, employeeId, dayStart!, dayStart!);
      const record = await tx.attendance.create({
      data: {
        tenantId: session.tenantId,
        employeeId,
        branchId: employee.branchId ?? null,
        shiftId: (await shiftForEmployeeDay(employee, dayStart, tx))?.id ?? null,
        date: dayStart,
        status,
        note,
        finalized: true,
        reviewStatus: "manual_override",
      },
    });
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "attendance.create_manual", entity: "Attendance", entityId: record.id, summary: note, after: { employeeId, date: dayStart!.toISOString(), status, source: "manual_override" } } });
      return record;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ record }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "PAYROLL_LOCKED" || (e as { code?: string })?.code === "P2034") return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "An attendance record already exists for this day." }, { status: 409 });
    }
    throw e;
  }
}
