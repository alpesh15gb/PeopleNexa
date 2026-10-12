import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { inactiveEmployeeReportSelect, inactiveEmployeeReportWhere } from "@/lib/inactive-employee-report";

export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const manager = session.role === "branch_manager" || session.role === "location_manager"
    ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, locationId: true } })
    : null;
  if ((session.role === "branch_manager" && !manager?.branchId) || (session.role === "location_manager" && !manager?.locationId)) {
    return NextResponse.json({ error: "No reporting scope assigned." }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const employees = await prisma.employee.findMany({
    where: inactiveEmployeeReportWhere({ tenantId: session.tenantId, role: session.role, manager, branchId: params.get("branchId") ?? "", departmentId: params.get("departmentId") ?? "", query: params.get("q") ?? "" }),
    select: inactiveEmployeeReportSelect, orderBy: { employeeNumber: "asc" },
  });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleNexa";
  const sheet = workbook.addWorksheet("Inactive employees");
  sheet.addRow(["Employee Code", "Device Code", "Employee", "Designation", "Department", "Branch", "Status"]);
  for (const employee of employees) sheet.addRow([employee.employeeNumber, employee.deviceCode ?? "", `${employee.firstName} ${employee.lastName}`.trim(), employee.position ?? "", employee.department?.name ?? "", employee.branch?.name ?? "", "Inactive"]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243B53" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:G1";
  [22, 20, 38, 30, 28, 42, 16].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  // IDs remain text, retaining any leading zeros. ExcelJS string cells are never formulas.
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(2).numFmt = "@";
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="inactive-employees.xlsx"',
    "Cache-Control": "private, no-store",
  } });
}
