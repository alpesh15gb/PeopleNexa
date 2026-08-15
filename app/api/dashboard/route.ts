import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, toDateKey, monthKey, addDays } from "@/lib/dates";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = startOfDay(new Date());
  const range = { gte: today, lt: addDays(today, 1) };

  if (session.role === "admin") {
    const [employees, attendance, departments, pendingLeaves, weekRecords] = await Promise.all([
      prisma.employee.findMany({ where: { tenantId: session.tenantId, status: "active" } }),
      prisma.attendance.findMany({
        where: { tenantId: session.tenantId, date: range },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }),
      prisma.department.findMany({
        where: { tenantId: session.tenantId },
        include: { _count: { select: { employees: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: { tenantId: session.tenantId, status: "pending" },
        include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
        orderBy: { appliedAt: "desc" },
        take: 10,
      }),
      prisma.attendance.groupBy({
        by: ["date", "status"],
        where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today } },
        _count: true,
      }),
    ]);

    const counts = { present: 0, late: 0, permission: 0, absent: 0, half_day: 0 };
    for (const a of attendance) counts[a.status as keyof typeof counts] = (counts[a.status as keyof typeof counts] ?? 0) + 1;

    const onLeave = pendingLeaves.filter(
      (l) => l.status === "pending" && l.fromDate <= today
    ).length;

    const week: { day: string; present: number; late: number; absent: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const recs = weekRecords.filter((r) => toDateKey(r.date) === toDateKey(day));
      week.push({
        day: toDateKey(day),
        present: recs.filter((r) => r.status === "present" || r.status === "late").reduce((s, r) => s + r._count, 0),
        late: recs.filter((r) => r.status === "late").reduce((s, r) => s + r._count, 0),
        absent: recs.filter((r) => r.status === "absent").reduce((s, r) => s + r._count, 0),
      });
    }

    return NextResponse.json({
      summary: {
        totalEmployees: employees.length,
        present: counts.present,
        late: counts.late,
        permission: counts.permission,
        absent: counts.absent,
        onLeave,
        pendingLeaves: pendingLeaves.length,
      },
      departments: departments.map((d) => ({ name: d.name, count: d._count.employees })),
      attendance,
      week,
      pendingLeaves,
    });
  }

  // Employee view
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    include: { shift: true, branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [todayRecord, monthRecords, balances, pendingRequests] = await Promise.all([
    prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: range },
      orderBy: { date: "desc" },
    }),
    prisma.attendance.findMany({
      where: { employeeId: employee.id, date: { gte: today } },
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { employeeId: employee.id, status: { in: ["approved", "pending"] } },
      _count: true,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, status: "pending" },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    today: {
      date: toDateKey(today),
      record: todayRecord,
      shift: employee.shift,
      branch: employee.branch,
      month: monthKey(today),
      monthCount: monthRecords.length,
    },
    balances: balances.map((b) => ({ leaveTypeId: b.leaveTypeId, status: b.status, used: b._count })),
    pendingRequests,
  });
}
