import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";

const ALLOWED_ROLES = ["admin", "supervisor", "branch_manager", "location_manager"] as const;

type AttendanceRow = {
  id: string;
  employeeId: string;
  date: Date;
  punchInTime: Date | null;
  punchOutTime: Date | null;
  status: string;
  employee: {
    employeeNumber: string;
    deviceCode: string | null;
    firstName: string;
    lastName: string;
    branch: { name: string } | null;
    department: { name: string } | null;
    shift: { name: string } | null;
  };
};

type DevicePunch = {
  employeeId: string;
  punchTime: Date;
  device: { name: string; serialNumber: string } | null;
  realtimeDevice: { name: string; serialNumber: string } | null;
};

function nearestMachine(punches: DevicePunch[], at: Date | null): { name: string; serialNumber: string } | null {
  if (!at) return null;
  let nearest: DevicePunch | null = null;
  let difference = Number.POSITIVE_INFINITY;
  for (const punch of punches) {
    const candidate = punch.device ?? punch.realtimeDevice;
    const delta = Math.abs(punch.punchTime.getTime() - at.getTime());
    if (candidate && delta < difference) {
      nearest = punch;
      difference = delta;
    }
  }
  // Do not attach an unrelated device when a source event was not retained.
  if (!nearest || difference > 12 * 60 * 60 * 1000) return null;
  return nearest.device ?? nearest.realtimeDevice;
}

async function withMachines(rows: AttendanceRow[], tenantId: string, start: Date, end: Date) {
  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  if (!employeeIds.length) return rows.map((row) => ({ ...row, deviceIn: null, deviceOut: null, workingMinutes: null }));
  const punches = await prisma.punch.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, punchTime: { gte: start, lt: end } },
    select: { employeeId: true, punchTime: true, device: { select: { name: true, serialNumber: true } }, realtimeDevice: { select: { name: true, serialNumber: true } } },
  });
  const byEmployee = new Map<string, DevicePunch[]>();
  for (const punch of punches) {
    const employeePunches = byEmployee.get(punch.employeeId) ?? [];
    employeePunches.push(punch);
    byEmployee.set(punch.employeeId, employeePunches);
  }
  return rows.map((row) => ({
    ...row,
    deviceIn: nearestMachine(byEmployee.get(row.employeeId) ?? [], row.punchInTime),
    deviceOut: nearestMachine(byEmployee.get(row.employeeId) ?? [], row.punchOutTime),
    workingMinutes: row.punchInTime && row.punchOutTime ? Math.max(0, Math.round((row.punchOutTime.getTime() - row.punchInTime.getTime()) / 60_000)) : null,
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
        ? { branch: { locationId: manager?.locationId ?? "__none__" } }
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
    employee: { ...employeeScope, ...searchFilter },
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
        employee: {
          select: {
            employeeNumber: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
            branch: { select: { name: true } },
            department: { select: { name: true } },
            shift: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { punchInTime: "asc" }],
      take: 5000,
    });
    const rows = await withMachines(attendance, session.tenantId, start, end);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Punch Details");
    ws.columns = [
      { header: "Employee Code", key: "code", width: 16 },
      { header: "Device Code", key: "deviceCode", width: 14 },
      { header: "Employee Name", key: "name", width: 26 },
      { header: "Branch / Division", key: "branch", width: 26 },
      { header: "Department", key: "department", width: 20 },
      { header: "Date", key: "date", width: 14 },
      { header: "Device IN", key: "deviceIn", width: 26 },
      { header: "In Time (IST)", key: "inTime", width: 14 },
      { header: "Device OUT", key: "deviceOut", width: 26 },
      { header: "Out Time (IST)", key: "outTime", width: 14 },
      { header: "Attendance", key: "attendance", width: 14 },
      { header: "Working Hours", key: "workingHours", width: 16 },
      { header: "Shift", key: "shift", width: 16 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const row of rows) {
      ws.addRow({
        code: row.employee.employeeNumber,
        deviceCode: row.employee.deviceCode ?? "",
        name: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
        branch: row.employee.branch?.name ?? "",
        department: row.employee.department?.name ?? "",
        date: istDateKey(row.date),
        deviceIn: row.deviceIn?.name ?? "",
        inTime: row.punchInTime ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(row.punchInTime) : "",
        deviceOut: row.deviceOut?.name ?? "",
        outTime: row.punchOutTime ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(row.punchOutTime) : "",
        attendance: row.status,
        workingHours: row.workingMinutes == null ? "" : `${Math.floor(row.workingMinutes / 60)}h ${row.workingMinutes % 60}m`,
        shift: row.employee.shift?.name ?? "",
        status: "ACTIVE",
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
        employee: {
          select: {
            employeeNumber: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
          branch: { select: { name: true } },
          department: { select: { name: true } },
          shift: { select: { name: true } },
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
