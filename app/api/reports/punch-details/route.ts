import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";

const ALLOWED_ROLES = ["admin", "supervisor", "branch_manager", "location_manager"] as const;

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
    punchTime: { gte: start, lt: end },
    employee: { ...employeeScope, ...searchFilter },
  };

  if (format === "xlsx") {
    const rows = await prisma.punch.findMany({
      where,
      select: {
        punchTime: true,
        inOutHint: true,
        employee: {
          select: {
            employeeNumber: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
            branch: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        device: { select: { name: true, serialNumber: true } },
        realtimeDevice: { select: { name: true, serialNumber: true } },
      },
      orderBy: { punchTime: "desc" },
      take: 5000,
    });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Punch Details");
    ws.columns = [
      { header: "Employee Code", key: "code", width: 16 },
      { header: "Device Code", key: "deviceCode", width: 14 },
      { header: "Employee Name", key: "name", width: 26 },
      { header: "Branch / Division", key: "branch", width: 26 },
      { header: "Department", key: "department", width: 20 },
      { header: "Machine", key: "machine", width: 26 },
      { header: "Machine Serial", key: "serial", width: 20 },
      { header: "Punch Time (IST)", key: "time", width: 22 },
      { header: "Type", key: "type", width: 10 },
    ];
    for (const p of rows) {
      ws.addRow({
        code: p.employee.employeeNumber,
        deviceCode: p.employee.deviceCode ?? "",
        name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
        branch: p.employee.branch?.name ?? "",
        department: p.employee.department?.name ?? "",
        machine: (p.device ?? p.realtimeDevice)?.name ?? "",
        serial: (p.device ?? p.realtimeDevice)?.serialNumber ?? "",
        time: new Date(p.punchTime.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " "),
        type: p.inOutHint,
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

  const [total, punches] = await Promise.all([
    prisma.punch.count({ where }),
    prisma.punch.findMany({
      where,
      select: {
        id: true,
        punchTime: true,
        inOutHint: true,
        employee: {
          select: {
            employeeNumber: true,
            deviceCode: true,
            firstName: true,
            lastName: true,
            branch: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        device: { select: { name: true, serialNumber: true } },
        realtimeDevice: { select: { name: true, serialNumber: true } },
      },
      orderBy: { punchTime: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
  ]);
  return NextResponse.json({ total, page, size, from, to, punches });
}
