import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istDateKey, istStartOfDay, parseIST } from "@/lib/ist";
import { isMonthKey, monthKeyIST } from "@/lib/dates";
import {
  buildDeviceDaily,
  buildDeviceMonthly,
  buildPerformance,
  buildStatusMatrix,
  buildWorkSummary,
  type DeviceDailyOutput,
  type DeviceMonthlyOutput,
  type DevicePerformanceOutput,
  type DeviceStatusMatrixOutput,
  type DeviceWorkSummaryOutput,
  type SnapshotPunch,
} from "@/lib/device-report";

function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parsed = parseIST(`${key} 00:00:00`);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return istDateKey(parsed) === key;
}

function monthRange(month: string): { start: Date; end: Date } {
  const start = parseIST(`${month}-01 00:00:00`)!;
  // Days in month from the key itself (1-based): Date.UTC(y, m, 0) is the
  // last day of month m. Never derive it from getUTCMonth() of an IST-midnight
  // instant — that instant sits in the previous UTC month and produced an
  // empty [start, end) range (every monthly report all-absent).
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getDate();
  return { start, end: new Date(start.getTime() + daysInMonth * 86400000) };
}

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Branch scope: branch_manager is pinned to their own branch (same pattern
  // as the attendance route); admin/supervisor may filter via branchId.
  let scopedBranchId: string | null = null;
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) {
      return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
    }
    scopedBranchId = manager.branchId;
  }

  const params = req.nextUrl.searchParams;
  const kind = params.get("kind") || "daily";
  if (kind !== "daily" && kind !== "monthly" && kind !== "status-matrix" && kind !== "work-summary" && kind !== "performance") {
    return NextResponse.json({ error: "kind must be one of: daily, monthly, status-matrix, work-summary, performance." }, { status: 400 });
  }
  const format = (params.get("format") || "json").toLowerCase();
  if (format !== "json" && format !== "xlsx") {
    return NextResponse.json({ error: "format must be one of: json, xlsx." }, { status: 400 });
  }

  const branchParam = params.get("branchId") || undefined;
  if (session.role === "branch_manager" && branchParam && branchParam !== scopedBranchId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const branchId = scopedBranchId ?? branchParam ?? undefined;
  const departmentId = params.get("departmentId") || undefined;

  // Server-side pagination for the heavy monthly kinds: screens fetch one
  // page (25 staff) instead of building + shipping ~1.5MB per click, which
  // piled onto the single Node thread under concurrent load until requests
  // crossed the proxy timeout. Excel exports omit `page` and get everything.
  const PAGE_SIZE = 25;
  const pageParam = params.get("page");
  const page = pageParam !== null ? Math.max(0, parseInt(pageParam, 10) || 0) : null;
  const q = (params.get("q") || "").trim().slice(0, 60);

  let rangeStart: Date;
  let rangeEnd: Date;
  let dayKey = "";
  let monthKey = "";
  if (kind === "daily") {
    dayKey = params.get("date") || istDateKey(new Date());
    if (!isValidDateKey(dayKey)) {
      return NextResponse.json({ error: "date must use YYYY-MM-DD format." }, { status: 400 });
    }
    rangeStart = parseIST(`${dayKey} 00:00:00`)!;
    rangeEnd = new Date(rangeStart.getTime() + 86400000);
  } else {
    monthKey = params.get("month") || monthKeyIST(new Date());
    if (!isMonthKey(monthKey)) {
      return NextResponse.json({ error: "month must use YYYY-MM format." }, { status: 400 });
    }
    ({ start: rangeStart, end: rangeEnd } = monthRange(monthKey));
  }
  const rangeDayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
  const dayKeys: string[] = [];
  for (let n = 0; n < rangeDayCount; n++) {
    dayKeys.push(istDateKey(new Date(rangeStart.getTime() + n * 86400000)));
  }

  const employeeWhere = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    ...(branchId ? { branchId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(q
      ? {
          OR: [
            { employeeNumber: { contains: q, mode: "insensitive" as const } },
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, tenant, branch] = await Promise.all([
    prisma.employee.count({ where: employeeWhere }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } }),
    branchId
      ? prisma.branch.findFirst({ where: { id: branchId, tenantId: session.tenantId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      position: true,
      shift: { select: { name: true, startTime: true, endTime: true } },
      department: { select: { name: true } },
    },
    orderBy: { employeeNumber: "asc" },
    ...(page !== null ? { skip: page * PAGE_SIZE, take: PAGE_SIZE } : {}),
  });
  // Day-level queries are scoped to the page's employees so a screen fetch
  // touches ~25 staff, not the whole company.
  const pageIds = employees.map((e) => e.id);

  const [department, runByEmployee, records, leaves, holidays, punches] = await Promise.all([
    departmentId
      ? prisma.department.findFirst({ where: { id: departmentId, tenantId: session.tenantId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { firstName: true, lastName: true } }),
    prisma.attendance.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: pageIds },
        date: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        employeeId: true,
        date: true,
        status: true,
        lateMinutes: true,
        overtimeMinutes: true,
        punchInTime: true,
        punchOutTime: true,
        punches: true,
        shift: { select: { name: true, startTime: true, endTime: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: pageIds },
        status: "approved",
        fromDate: { lt: rangeEnd },
        toDate: { gte: rangeStart },
      },
      select: { employeeId: true, fromDate: true, toDate: true },
    }),
    prisma.holiday.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [{ isRecurring: true }, { date: { gte: rangeStart, lt: rangeEnd } }],
      },
      select: { date: true, isRecurring: true },
    }),
    prisma.punch.findMany({
      where: {
        tenantId: session.tenantId,
        employeeId: { in: pageIds },
        punchTime: { gte: rangeStart, lt: rangeEnd },
      },
      select: { employeeId: true, punchTime: true, inOutHint: true },
      orderBy: { punchTime: "asc" },
    }),
  ]);

  // Tenant-holiday IST day keys (recurring holidays match on MM-DD).
  const holidayKeys = new Set<string>();
  for (const h of holidays) {
    const hKey = istDateKey(h.date);
    for (const day of dayKeys) {
      if (h.isRecurring ? hKey.slice(5) === day.slice(5) : hKey === day) {
        holidayKeys.add(day);
      }
    }
  }

  // Approved-leave lookup at IST day granularity.
  const leaveKeys = new Set<string>(); // `${employeeId}|${dayKey}`
  for (const l of leaves) {
    const lStart = istStartOfDay(l.fromDate);
    const lEnd = istStartOfDay(l.toDate);
    for (const day of dayKeys) {
      const dayStart = parseIST(`${day} 00:00:00`)!;
      if (lStart.getTime() <= dayStart.getTime() && lEnd.getTime() >= dayStart.getTime()) {
        leaveKeys.add(`${l.employeeId}|${day}`);
      }
    }
  }

  const punchesByDay = new Map<string, SnapshotPunch[]>();
  for (const p of punches) {
    const key = `${p.employeeId}|${istDateKey(p.punchTime)}`;
    if (!punchesByDay.has(key)) punchesByDay.set(key, []);
    punchesByDay.get(key)!.push({ time: p.punchTime, type: p.inOutHint });
  }

  const tenantInfo = { name: tenant?.name ?? "Company" };
  const branchInfo = branch ? { name: branch.name } : null;
  const departmentInfo = department ? { name: department.name } : null;

  if (kind === "daily") {
    const dailyLeaves = new Set<string>();
    for (const key of leaveKeys) {
      if (key.endsWith(`|${dayKey}`)) dailyLeaves.add(key.slice(0, -(dayKey.length + 1)));
    }
    const output: DeviceDailyOutput = buildDeviceDaily({
      tenant: tenantInfo,
      branch: branchInfo,
      day: dayKey,
      employees,
      records,
      punchesByDay,
      leaves: dailyLeaves,
      holidays: holidayKeys,
    });
    if (format === "xlsx") return dailyXlsx(output, dayKey);
    return NextResponse.json(page !== null ? { ...output, total, page } : output);
  }

  if (kind === "monthly") {
    const output: DeviceMonthlyOutput = buildDeviceMonthly({
      tenant: tenantInfo,
      branch: branchInfo,
      month: monthKey,
      employees,
      records,
      punchesByDay,
      leaves: leaveKeys,
      holidays: holidayKeys,
    });
    if (format === "xlsx") return monthlyXlsx(output, monthKey);
    return NextResponse.json(page !== null ? { ...output, total, page } : output);
  }

  if (kind === "status-matrix") {
    const output: DeviceStatusMatrixOutput = buildStatusMatrix({
      tenant: tenantInfo,
      branch: branchInfo,
      department: departmentInfo,
      month: monthKey,
      employees,
      records,
      punchesByDay,
      leaves: leaveKeys,
      holidays: holidayKeys,
    });
    if (format === "xlsx") return statusMatrixXlsx(output, monthKey);
    return NextResponse.json(page !== null ? { ...output, total, page } : output);
  }

  if (kind === "work-summary") {
    const runBy = runByEmployee ? `${runByEmployee.firstName} ${runByEmployee.lastName}`.trim() : "Admin";
    const generatedAt = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const output: DeviceWorkSummaryOutput = buildWorkSummary({
      tenant: tenantInfo,
      branch: branchInfo,
      month: monthKey,
      employees,
      records,
      punchesByDay,
      leaves: leaveKeys,
      holidays: holidayKeys,
      runBy,
      generatedAt,
    });
    if (format === "xlsx") return workSummaryXlsx(output, monthKey);
    return NextResponse.json(page !== null ? { ...output, total, page } : output);
  }

  const output: DevicePerformanceOutput = buildPerformance({
    tenant: tenantInfo,
    branch: branchInfo,
    month: monthKey,
    employees,
    records,
    punchesByDay,
    leaves: leaveKeys,
    holidays: holidayKeys,
  });
  if (format === "xlsx") return performanceXlsx(output, monthKey);
  return NextResponse.json(page !== null ? { ...output, total, page } : output);
}

// ─── Excel export (same columns/blocks as the on-screen report) ────────────

const THIN_BORDER: ExcelJS.BorderStyle = "thin";

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function styleTitleRow(row: ExcelJS.Row) {
  row.font = { bold: true, size: 12 };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function borderAll(ws: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).border = {
      top: { style: THIN_BORDER },
      bottom: { style: THIN_BORDER },
      left: { style: THIN_BORDER },
      right: { style: THIN_BORDER },
    };
  }
}

function dailyXlsx(output: DeviceDailyOutput, dayKey: string) {
  return xlsxResponse(`daily-attendance-${dayKey}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("Daily Attendance");
    const cols = output.columns.length;
    ws.mergeCells(1, 1, 1, 4);
    ws.mergeCells(1, 5, 1, 8);
    ws.mergeCells(1, 9, 1, cols);
    ws.getCell("A1").value = output.header.left;
    ws.getCell("E1").value = output.header.center;
    ws.getCell("I1").value = output.header.right;
    styleTitleRow(ws.getRow(1));
    const headerRow = ws.addRow(output.columns);
    styleHeaderRow(headerRow);
    for (const r of output.rows) {
      ws.addRow([
        r.code,
        r.name,
        r.designation,
        r.shift,
        r.inTime,
        r.outTime,
        r.late,
        r.early,
        r.duration,
        r.overtime,
        r.punches,
        r.status,
      ]);
    }
    const widths = [14, 22, 18, 26, 9, 9, 9, 9, 10, 10, 30, 9];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    for (let n = 1; n <= output.rows.length + 2; n++) borderAll(ws, n, cols);
  });
}

function monthlyXlsx(output: DeviceMonthlyOutput, monthKey: string) {
  return xlsxResponse(`monthly-attendance-${monthKey}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("Monthly Attendance");
    const cols = output.columns.length;
    const widths = [7, 9, 26, 9, 9, 9, 9, 10, 10];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    let isFirst = true;
    for (const block of output.blocks) {
      if (!isFirst) ws.addRow([]);
      isFirst = false;
      const titleRow = ws.addRow([`${output.header.left}  |  ${output.header.center}  |  ${output.header.right}`]);
      ws.mergeCells(titleRow.number, 1, titleRow.number, cols);
      styleTitleRow(titleRow);
      borderAll(ws, titleRow.number, cols);
      const empRow = ws.addRow([`Code | ${block.code} | Name | ${block.name} | Designation | ${block.designation}`]);
      ws.mergeCells(empRow.number, 1, empRow.number, cols);
      empRow.font = { bold: true };
      borderAll(ws, empRow.number, cols);
      const sumRow = ws.addRow([block.summaryLine]);
      ws.mergeCells(sumRow.number, 1, sumRow.number, cols);
      sumRow.alignment = { wrapText: true };
      borderAll(ws, sumRow.number, cols);
      const headerRow = ws.addRow(output.columns);
      styleHeaderRow(headerRow);
      for (const d of block.days) {
        ws.addRow([d.day, d.status, d.shift, d.inTime, d.outTime, d.lateBy, d.earlyBy, d.duration, d.overTime]);
      }
      for (let n = headerRow.number; n <= ws.rowCount; n++) borderAll(ws, n, cols);
    }
  });
}

function statusMatrixXlsx(output: DeviceStatusMatrixOutput, monthKey: string) {
  return xlsxResponse(`status-matrix-${monthKey}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("Status Matrix");
    const dayCount = output.blocks[0]?.days.length ?? 0;
    const cols = dayCount + 1;
    ws.getColumn(1).width = 10;
    for (let d = 1; d <= dayCount; d++) ws.getColumn(d + 1).width = 7;
    const titleRow = ws.addRow([`${output.header.left}  |  ${output.header.center}  |  ${output.header.right}`]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, Math.max(cols, 1));
    styleTitleRow(titleRow);
    borderAll(ws, titleRow.number, Math.max(cols, 1));
    if (output.department) {
      const depRow = ws.addRow([`Department | ${output.department}`]);
      ws.mergeCells(depRow.number, 1, depRow.number, Math.max(cols, 1));
      depRow.font = { bold: true };
      borderAll(ws, depRow.number, Math.max(cols, 1));
    }
    let isFirst = true;
    for (const block of output.blocks) {
      if (!isFirst) ws.addRow([]);
      isFirst = false;
      const empRow = ws.addRow([`Emp. Code ${block.code} Emp. Name ${block.name}`]);
      ws.mergeCells(empRow.number, 1, empRow.number, Math.max(cols, 1));
      empRow.font = { bold: true };
      borderAll(ws, empRow.number, Math.max(cols, 1));
      const headRow = ws.addRow(["", ...block.days.map((d) => `${d.day} ${d.dow}`)]);
      styleHeaderRow(headRow);
      const statusRow = ws.addRow(["Status", ...block.days.map((d) => d.status)]);
      const inRow = ws.addRow(["InTime", ...block.days.map((d) => d.inTime)]);
      const outRow = ws.addRow(["OutTime", ...block.days.map((d) => d.outTime)]);
      const totalRow = ws.addRow(["Total", ...block.days.map((d) => d.total)]);
      for (let n = headRow.number; n <= totalRow.number; n++) borderAll(ws, n, Math.max(cols, 1));
      // P green / A red fills on the status row.
      statusRow.eachCell((cell, col) => {
        if (col === 1) return;
        const v = String(cell.value ?? "");
        if (v === "P" || v === "½P") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        else if (v === "A") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
      });
    }
  });
}

const WORK_SUMMARY_COLUMNS = ["Date", "Shift", "First IN", "Last OUT", "Gross", "Work Hours", "Late", "Overtime", "Early"];

function workSummaryXlsx(output: DeviceWorkSummaryOutput, monthKey: string) {
  return xlsxResponse(`work-summary-${monthKey}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("Work Summary");
    const cols = WORK_SUMMARY_COLUMNS.length;
    const widths = [13, 26, 9, 9, 9, 11, 9, 10, 9];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    const titleRow = ws.addRow([`${output.header.left}  |  ${output.header.center}  |  ${output.header.right}`]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, cols);
    styleTitleRow(titleRow);
    borderAll(ws, titleRow.number, cols);
    const runRow = ws.addRow([`Run by ${output.header.runBy}  |  Date/Time ${output.header.generatedAt}`]);
    ws.mergeCells(runRow.number, 1, runRow.number, cols);
    borderAll(ws, runRow.number, cols);
    let isFirst = true;
    for (const block of output.blocks) {
      if (!isFirst) ws.addRow([]);
      isFirst = false;
      const empRow = ws.addRow([`${block.code} - ${block.name}`]);
      ws.mergeCells(empRow.number, 1, empRow.number, cols);
      empRow.font = { bold: true };
      borderAll(ws, empRow.number, cols);
      const headerRow = ws.addRow(WORK_SUMMARY_COLUMNS);
      styleHeaderRow(headerRow);
      for (const r of block.rows) {
        ws.addRow([r.date, r.shift, r.firstIn, r.lastOut, r.gross, r.work, r.late, r.overtime, r.early]);
      }
      const totalRow = ws.addRow([
        "Totals",
        "",
        "",
        "",
        block.totals.gross,
        block.totals.work,
        block.totals.late,
        block.totals.overtime,
        block.totals.early,
      ]);
      totalRow.font = { bold: true };
      for (let n = headerRow.number; n <= ws.rowCount; n++) borderAll(ws, n, cols);
    }
  });
}

function performanceXlsx(output: DevicePerformanceOutput, monthKey: string) {
  return xlsxResponse(`performance-${monthKey}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("Performance");
    const dayCount = output.blocks[0]?.days.length ?? 0;
    const cols = dayCount + 1;
    ws.getColumn(1).width = 18;
    for (let d = 1; d <= dayCount; d++) ws.getColumn(d + 1).width = 9;
    let isFirst = true;
    for (const block of output.blocks) {
      if (!isFirst) ws.addRow([]);
      isFirst = false;
      const titleRow = ws.addRow([`${output.header.left}  |  ${output.header.center}  |  ${output.header.right}`]);
      ws.mergeCells(titleRow.number, 1, titleRow.number, Math.max(cols, 1));
      styleTitleRow(titleRow);
      borderAll(ws, titleRow.number, Math.max(cols, 1));
      const metaRow = ws.addRow([
        `Dep | ${block.department} | Name | ${block.name} | E.Code | ${block.code} | Desig | ${block.designation} | Shift | ${block.shiftHours}`,
      ]);
      ws.mergeCells(metaRow.number, 1, metaRow.number, Math.max(cols, 1));
      metaRow.font = { bold: true };
      metaRow.alignment = { wrapText: true };
      borderAll(ws, metaRow.number, Math.max(cols, 1));
      const headRow = ws.addRow(["", ...block.days.map((d) => d.day)]);
      styleHeaderRow(headRow);
      const rows: (string | number)[][] = [
        ["Status", ...block.days.map((d) => d.status)],
        ["IN", ...block.days.map((d) => d.inTime)],
        ["OUT", ...block.days.map((d) => d.outTime)],
        ["Shift", ...block.days.map((d) => d.shift)],
        ["Late", ...block.days.map((d) => d.late)],
        ["OT", ...block.days.map((d) => d.ot)],
        ["Early", ...block.days.map((d) => d.early)],
      ];
      for (const r of rows) ws.addRow(r);
      for (let n = headRow.number; n <= ws.rowCount; n++) borderAll(ws, n, Math.max(cols, 1));
      const footers = [
        `Total Working Hrs: ${block.totals.work} | Total OT Hrs: ${block.totals.ot}`,
        `Present: ${block.totals.present} Absent: ${block.totals.absent} Paid Day: ${block.totals.paidDay}`,
        `WO: ${block.totals.wo} HLD: ${block.totals.hld} Leave: ${block.totals.leave}`,
      ];
      for (const f of footers) {
        const fr = ws.addRow([f]);
        ws.mergeCells(fr.number, 1, fr.number, Math.max(cols, 1));
        borderAll(ws, fr.number, Math.max(cols, 1));
      }
    }
  });
}

async function xlsxResponse(filename: string, build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PeopleNexa";
  build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
