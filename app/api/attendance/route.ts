import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fromDateKey, startOfDay, endOfDay, todayKey } from "@/lib/dates";
import { finalizeEligibleDays } from "@/lib/reconcile";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Lazy finalization (Phase 4): once a day's window closes + grace, re-derive
  // non-finalized days so late punches stop mutating them and lone-punch days
  // get flagged. Bounded so a page load never stalls; the polling job drains
  // the rest.
  await finalizeEligibleDays(session.tenantId, 100);

  const dateKey = req.nextUrl.searchParams.get("date") || todayKey();
  const dayStart = startOfDay(fromDateKey(dateKey));

  const [employees, records, leaves, holidays] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        shift: { select: { name: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: dayStart, lte: endOfDay(dayStart) } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lte: endOfDay(dayStart) },
        toDate: { gte: dayStart },
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId, date: { gte: dayStart, lte: endOfDay(dayStart) } } }),
  ]);

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
      status: leave ? "on_leave" : record ? record.status : "absent",
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    date: dateKey,
    isHoliday: holidays.length > 0,
    holidays: holidays.map((h) => h.name),
    counts,
    rows,
  });
}
