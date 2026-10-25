import { assessedWorkingMinutes, assessAttendanceDay, isAttendanceHoliday, isScheduledWeeklyOff } from "@/lib/attendance-assessment";
import { istDateKey } from "@/lib/ist";
import { employeeLocationScope } from "@/lib/location-scope";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, formatDateIST, isDateKey } from "@/lib/dates";
import { nearestReportSource } from "@/lib/punch-report-source";

const ALLOWED_ROLES = ["admin", "supervisor", "branch_manager", "location_manager"] as const;

type AttendanceRow = {
  id: string;
  employeeId: string;
  date: Date;
  punchInTime: Date | null;
  punchOutTime: Date | null;
  status: string;
  reviewStatus: string | null;
  shiftId: string | null;
  shift: { sundayWeeklyOff: boolean } | null;
  employee: {
    employeeNumber: string;
    joiningDate: Date | null;
    shiftId: string | null;
    deviceCode: string | null;
    firstName: string;
    lastName: string;
    position: string | null;
    branch: { name: string } | null;
    department: { name: string } | null;
    employmentProfile: { subDepartment: string | null } | null;
    shift: { name: string; sundayWeeklyOff: boolean } | null;
  };
};

type DevicePunch = {
  employeeId: string;
  punchTime: Date;
  source: string;
  device: { name: string; serialNumber: string } | null;
  realtimeDevice: { name: string; serialNumber: string } | null;
};

async function withMachines(rows: AttendanceRow[], tenantId: string, start: Date, end: Date) {
  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  if (!employeeIds.length) return [];
  const [punches, rosters, leaves, holidays] = await Promise.all([prisma.punch.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, authStatus: { in: ["auto", "approved"] }, punchTime: { gte: new Date(start.getTime() - 86400000), lt: new Date(end.getTime() + 86400000) } },
    select: { employeeId: true, punchTime: true, source: true, device: { select: { name: true, serialNumber: true } }, realtimeDevice: { select: { name: true, serialNumber: true } } },
  }),
    prisma.rosterAssignment.findMany({ where: { tenantId, employeeId: { in: employeeIds }, date: { gte: start, lt: end } }, include: { shift: true } }),
    prisma.leaveRequest.findMany({ where: { tenantId, employeeId: { in: employeeIds }, status: "approved", fromDate: { lt: end }, toDate: { gte: start } }, select: { employeeId: true, fromDate: true, toDate: true } }),
    prisma.holiday.findMany({ where: { tenantId, OR: [{ date: { gte: start, lt: end } }, { isRecurring: true }] }, select: { date: true, isRecurring: true } }),
  ]);
  const rosterByDay = new Map(rosters.map(r => [`${r.employeeId}|${istDateKey(r.date)}`, r.shift]));
  const assessment = (row: AttendanceRow) => {
    const day = istDateKey(row.date), shift = rosterByDay.get(`${row.employeeId}|${day}`) ?? row.shift ?? row.employee.shift;
    return assessAttendanceDay({ day, record: row, joiningDate: row.employee.joiningDate, hasShift: Boolean(shift || row.shiftId || row.employee.shiftId), holiday: isAttendanceHoliday(day, holidays), leave: leaves.some(l => l.employeeId === row.employeeId && istDateKey(l.fromDate) <= day && istDateKey(l.toDate) >= day), weeklyOff: isScheduledWeeklyOff(day, shift) });
  };
  const byEmployee = new Map<string, DevicePunch[]>();
  for (const punch of punches) {
    const employeePunches = byEmployee.get(punch.employeeId) ?? [];
    employeePunches.push(punch);
    byEmployee.set(punch.employeeId, employeePunches);
  }
  return rows.map((row) => ({
    ...row,
    deviceIn: nearestReportSource(byEmployee.get(row.employeeId) ?? [], row.punchInTime),
    deviceOut: nearestReportSource(byEmployee.get(row.employeeId) ?? [], row.punchOutTime),
    assessment: assessment(row).code,
    workingMinutes: assessment(row).assessedPresent ? assessedWorkingMinutes(row) : null,
    requiresReview: assessment(row).requiresReview,
  }));
}

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? from;
  if (!isDateKey(from) || !isDateKey(to)) {
    return NextResponse.json({ error: "Valid from and to dates are required." }, { status: 400 });
  }
  const fromRange = dayRangeIST(from);
  const toRange = dayRangeIST(to);
  const start = fromRange.start;
  const end = toRange.end;
  if (start.getTime() > end.getTime()) {
    return NextResponse.json({ error: "From date must be before To date." }, { status: 400 });
  }
  if (end.getTime() - start.getTime() > 93 * 86400000) return NextResponse.json({ error: "Select a date range of at most 93 days." }, { status: 400 });
  const format = (params.get("format") ?? "json").toLowerCase();
  const search = params.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const size = Math.min(500, Math.max(10, Number(params.get("size") ?? 50) || 50));

  const manager =
    session.role !== "admin"
      ? await prisma.employee.findFirst({
          where: { id: session.sub, tenantId: session.tenantId },
          select: { branchId: true, locationId: true },
        })
      : null;
  if (session.role === "branch_manager" && !manager?.branchId) {
    return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
  }
  if (session.role === "location_manager" && !manager?.locationId) {
    return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  }
  const employeeScope =
    session.role === "branch_manager"
      ? { branchId: manager?.branchId ?? "__none__" }
      : session.role === "location_manager"
        ? employeeLocationScope(manager?.locationId ?? "__none__")
        : {};
  const searchFilter = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { employeeNumber: { contains: search, mode: "insensitive" as const } },
          { deviceCode: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const where = {
    tenantId: session.tenantId,
    date: { gte: start, lt: end },
    employee: { AND: [employeeScope, searchFilter] },
  };

  if (format === "xlsx") {
    const attendance = await prisma.attendance.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        date: true,
        punchInTime: true,
        punchOutTime: true,
        status: true,
        reviewStatus: true,
        shiftId: true,
        shift: { select: { sundayWeeklyOff: true } },
        employee: {
          select: {
            employeeNumber: true,
            joiningDate: true,
            shiftId: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
            position: true,
            branch: { select: { name: true } },
            department: { select: { name: true } },
            employmentProfile: { select: { subDepartment: true } },
            shift: { select: { name: true, sundayWeeklyOff: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { punchInTime: "asc" }],
    });
    const rows = await withMachines(attendance, session.tenantId, start, end);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Punch Details");
    ws.columns = [
      { header: "Sl No", key: "serial", width: 8 },
      { header: "Employee ID", key: "code", width: 16 },
      { header: "Employee Name", key: "name", width: 26 },
      { header: "Designation", key: "designation", width: 24 },
      { header: "Division Name", key: "branch", width: 26 },
      { header: "Department Name", key: "department", width: 20 },
      { header: "Sub-Department Name", key: "subdepartment", width: 20 },
      { header: "Date", key: "date", width: 14 },
      { header: "In Device", key: "deviceIn", width: 26 },
      { header: "In Device Serial Number", key: "deviceInSerial", width: 24 },
      { header: "In Time (IST, includes date)", key: "inTime", width: 14 },
      { header: "Out Time (IST, includes date)", key: "outTime", width: 14 },
      { header: "Attendance", key: "attendance", width: 14 },
      { header: "Out Device", key: "deviceOut", width: 26 },
      { header: "Out Device Serial Number", key: "deviceOutSerial", width: 24 },
      { header: "Working Hours", key: "workingHours", width: 16 },
    ];
    for (const [index, row] of rows.entries()) {
      ws.addRow({
        serial: index + 1,
        code: row.employee.employeeNumber,
        name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
        designation: row.employee.position ?? "",
        branch: row.employee.branch?.name ?? "",
        department: row.employee.department?.name ?? "",
        subdepartment: row.employee.employmentProfile?.subDepartment ?? "",
        date: formatDateIST(row.date),
        deviceIn: row.deviceIn?.name ?? "",
        deviceInSerial: row.deviceIn?.serialNumber ?? "",
        inTime: row.punchInTime ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).format(row.punchInTime) : "",
        outTime: row.punchOutTime ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).format(row.punchOutTime) : "",
        attendance: row.assessment,
        deviceOut: row.deviceOut?.name ?? "",
        deviceOutSerial: row.deviceOut?.serialNumber ?? "",
        workingHours: row.requiresReview ? "Review" : row.workingMinutes == null ? "" : `${Math.floor(row.workingMinutes / 60)}h ${row.workingMinutes % 60}m`,
      });
    }
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="punch-details-${from}-to-${to}.xlsx"`,
      },
    });
  }

  const [total, attendance] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      select: {
        id: true,
        employeeId: true,
        date: true,
        punchInTime: true,
        punchOutTime: true,
        status: true,
        reviewStatus: true,
        shiftId: true,
        shift: { select: { sundayWeeklyOff: true } },
        employee: {
          select: {
            employeeNumber: true,
            joiningDate: true,
            shiftId: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
            position: true,
          branch: { select: { name: true } },
          department: { select: { name: true } },
          employmentProfile: { select: { subDepartment: true } },
          shift: { select: { name: true, sundayWeeklyOff: true } },
        },
        },
      },
      orderBy: [{ date: "desc" }, { punchInTime: "asc" }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  const rows = await withMachines(attendance, session.tenantId, start, end);
  return NextResponse.json({ total, page, size, from, to, rows });
}
