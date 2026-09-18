import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays, dayRangeIST, monthKeyIST } from "@/lib/dates";
import { istStartOfDay, istDateKey } from "@/lib/ist";
import { tallyDailyAttendance } from "@/lib/attendance-tally";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = istStartOfDay(new Date());
  const range = { gte: today, lt: addDays(today, 1) };

  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) {
      return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    }
    const branchId = manager.branchId;
    const [employees, attendance, departments, pendingLeaves, weekRecords] = await Promise.all([
      prisma.employee.findMany({
        where: { tenantId: session.tenantId, status: "active", loginOnly: false, branchId },
        select: {
          id: true,
          tenantId: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          position: true,
          joiningDate: true,
          profilePicture: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          managerId: true,
          payMode: true,
          workBasisRate: true,
          branchId: true,
          departmentId: true,
          shiftId: true,
        },
      }),
      prisma.attendance.findMany({
        where: { tenantId: session.tenantId, date: range, employee: { branchId, status: "active", loginOnly: false } },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }),
      prisma.department.findMany({
        where: { tenantId: session.tenantId },
        include: { _count: { select: { employees: { where: { branchId, status: "active", loginOnly: false } } } } },
      }),
      prisma.leaveRequest.findMany({
        where: { tenantId: session.tenantId, status: "pending", employee: { branchId } },
        include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
        orderBy: { appliedAt: "desc" },
        take: 10,
      }),
      prisma.attendance.groupBy({
        by: ["date", "status"],
        where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today }, employee: { branchId, status: "active", loginOnly: false } },
        _count: true,
      }),
    ]);

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lt: addDays(today, 1) },
        toDate: { gte: today },
        employee: { branchId, status: "active", loginOnly: false },
      },
      select: { employeeId: true },
    });
    const counts = tallyDailyAttendance(employees.map((employee) => employee.id), attendance, approvedLeaves.map((leave) => leave.employeeId));

    const week: { day: string; present: number; late: number; absent: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const recs = weekRecords.filter((r) => istDateKey(r.date) === istDateKey(day));
      week.push({
        day: istDateKey(day),
        present: recs.filter((r) => r.status === "present" || r.status === "late" || r.status === "half_day").reduce((s, r) => s + r._count, 0),
        late: recs.filter((r) => r.status === "late").reduce((s, r) => s + r._count, 0),
        absent: recs.filter((r) => r.status === "absent").reduce((s, r) => s + r._count, 0),
      });
    }

    return NextResponse.json({
      summary: {
        totalEmployees: counts.total,
        present: counts.present,
        late: counts.late,
        permission: counts.permission,
        absent: counts.absent,
        halfDay: counts.halfDay,
        onLeave: counts.onLeave,
        noRecord: counts.noRecord,
        pendingLeaves: pendingLeaves.length,
      },
      departments: departments.map((d) => ({ name: d.name, count: d._count.employees })),
      attendance,
      week,
      pendingLeaves,
    });
  }

  if (session.role === "admin") {
    const [employees, attendance, departments, pendingLeaves, weekRecords] = await Promise.all([
      prisma.employee.findMany({
        where: { tenantId: session.tenantId, status: "active", loginOnly: false },
        select: {
          id: true,
          tenantId: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          position: true,
          joiningDate: true,
          profilePicture: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          managerId: true,
          payMode: true,
          workBasisRate: true,
          branchId: true,
          departmentId: true,
          shiftId: true,
        },
      }),
      prisma.attendance.findMany({
        where: { tenantId: session.tenantId, date: range, employee: { status: "active", loginOnly: false } },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }),
      prisma.department.findMany({
        where: { tenantId: session.tenantId },
        include: { _count: { select: { employees: { where: { status: "active", loginOnly: false } } } } },
      }),
      prisma.leaveRequest.findMany({
        where: { tenantId: session.tenantId, status: "pending" },
        include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
        orderBy: { appliedAt: "desc" },
        take: 10,
      }),
      prisma.attendance.groupBy({
        by: ["date", "status"],
        where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today }, employee: { status: "active", loginOnly: false } },
        _count: true,
      }),
    ]);

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lt: addDays(today, 1) },
        toDate: { gte: today },
        employee: { status: "active", loginOnly: false },
      },
      select: { employeeId: true },
    });
    const counts = tallyDailyAttendance(employees.map((employee) => employee.id), attendance, approvedLeaves.map((leave) => leave.employeeId));

    const week: { day: string; present: number; late: number; absent: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = addDays(today, -i);
      const recs = weekRecords.filter((r) => istDateKey(r.date) === istDateKey(day));
      week.push({
        day: istDateKey(day),
        present: recs.filter((r) => r.status === "present" || r.status === "late" || r.status === "half_day").reduce((s, r) => s + r._count, 0),
        late: recs.filter((r) => r.status === "late").reduce((s, r) => s + r._count, 0),
        absent: recs.filter((r) => r.status === "absent").reduce((s, r) => s + r._count, 0),
      });
    }

    return NextResponse.json({
      summary: {
        totalEmployees: counts.total,
        present: counts.present,
        late: counts.late,
        permission: counts.permission,
        absent: counts.absent,
        halfDay: counts.halfDay,
        onLeave: counts.onLeave,
        noRecord: counts.noRecord,
        pendingLeaves: pendingLeaves.length,
      },
      departments: departments.map((d) => ({ name: d.name, count: d._count.employees })),
      attendance,
      week,
      pendingLeaves,
    });
  }

  // Employee view
  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    include: { shift: true, branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const monthStart = dayRangeIST(`${monthKeyIST(today)}-01`).start;
  const [todayRecord, monthRecords, balances, pendingRequests] = await Promise.all([
    prisma.attendance.findFirst({
      where: { employeeId: employee.id, tenantId: session.tenantId, date: range },
      orderBy: { date: "desc" },
    }),
    prisma.attendance.findMany({
      where: { employeeId: employee.id, tenantId: session.tenantId, date: { gte: monthStart, lt: addDays(today, 1) } },
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId", "status"],
      where: { employeeId: employee.id, tenantId: session.tenantId, status: { in: ["approved", "pending"] } },
      _count: true,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, tenantId: session.tenantId, status: "pending" },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    today: {
      date: istDateKey(today),
      record: todayRecord,
      shift: employee.shift,
      branch: employee.branch,
      month: monthKeyIST(today),
      monthCount: monthRecords.length,
    },
    balances: balances.map((b) => ({ leaveTypeId: b.leaveTypeId, status: b.status, used: b._count })),
    pendingRequests,
  });
}
