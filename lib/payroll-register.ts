import ExcelJS from "exceljs";
import type { PayslipDocumentSnapshot } from "@/lib/payslip-document";

type SnapshotRecord = Record<string, unknown>;
type RegisterPayslip = {
  grossEarnings: number;
  deductions: number;
  netSalary: number;
  inputSnapshot: unknown;
  document: PayslipDocumentSnapshot | null;
};
type RegisterRun = { id: string; month: string; status: string; payslips: RegisterPayslip[] };
type RegisterRow = {
  department: string;
  employeeNumber: string;
  employeeName: string;
  designation: string;
  joiningDate: string;
  days: { payable: number; present: number; late: number; half: number; absent: number; leave: number; paidLeave: number; unpaidLeave: number; overtimeHours: number };
  gross: number;
  earnedGross: number;
  deductions: number;
  net: number;
  components: Map<string, { contractual: number | null; earned: number }>;
};

const HEADER_FILL = "FF0F766E";
const TOTAL_FILL = "FFE2E8F0";
const moneyFormat = "#,##0.00";

function record(value: unknown): SnapshotRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as SnapshotRecord : {}; }
function text(value: unknown): string { return value == null ? "" : String(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function safeCell(value: string | number): string | number { return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value; }
function dateText(value: unknown): string { return value ? new Date(String(value)).toISOString().slice(0, 10) : ""; }
function columnName(index: number): string { let name = ""; while (index > 0) { const remainder = (index - 1) % 26; name = String.fromCharCode(65 + remainder) + name; index = Math.floor((index - 1) / 26); } return name; }
function sheetName(value: string, used: Set<string>): string {
  const base = (value.replace(/[\\/*?:\[\]]/g, " ").trim() || "Unassigned").slice(0, 31);
  let name = base; let suffix = 2;
  while (used.has(name)) { name = `${base.slice(0, 31 - String(suffix).length - 1)} ${suffix++}`; }
  used.add(name); return name;
}

function registerRow(payslip: RegisterPayslip): RegisterRow {
  const input = record(payslip.inputSnapshot);
  const employee = record(input.employee);
  const attendance = record(input.attendance);
  const document = payslip.document;
  const componentRows = document?.components.filter((component) => component.category === "earning" || component.category === "deduction") ?? [];
  return {
    department: (document?.employee.department ?? text(employee.departmentName)) || "Unassigned",
    employeeNumber: document?.employee.employeeNumber ?? text(employee.employeeNumber),
    employeeName: document?.employee.name ?? [text(employee.firstName), text(employee.lastName)].filter(Boolean).join(" "),
    designation: document?.employee.designation ?? text(employee.position),
    joiningDate: document?.employee.joiningDate ? dateText(document.employee.joiningDate) : dateText(employee.joiningDate),
    days: {
      payable: document?.days.payable ?? number(attendance.workingDays), present: number(attendance.presentDays), late: number(attendance.lateDays), half: number(attendance.halfDays), absent: number(attendance.absentDays), leave: number(attendance.onLeaveDays), paidLeave: number(attendance.paidLeaveDays), unpaidLeave: number(attendance.unpaidLeaveDays), overtimeHours: number(attendance.overtimeHours),
    },
    gross: document?.totals.gross ?? payslip.grossEarnings,
    earnedGross: document?.totals.earnedGross ?? document?.totals.gross ?? payslip.grossEarnings,
    deductions: document?.totals.deductions ?? payslip.deductions,
    net: document?.totals.net ?? payslip.netSalary,
    components: new Map(componentRows.map((component) => [`${component.category}:${component.code}`, { contractual: component.contractual, earned: component.earned }])),
  };
}

function styleHeader(row: ExcelJS.Row) { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }; row.alignment = { vertical: "middle", wrapText: true }; }

export async function payrollRegisterWorkbook(run: RegisterRun): Promise<Uint8Array> {
  const rows = run.payslips.map(registerRow).sort((a, b) => a.department.localeCompare(b.department) || a.employeeNumber.localeCompare(b.employeeNumber));
  const componentLabels = new Map<string, string>();
  for (const payslip of run.payslips) for (const component of payslip.document?.components ?? []) if (component.category === "earning" || component.category === "deduction") componentLabels.set(`${component.category}:${component.code}`, `${component.category === "earning" ? "Earning" : "Deduction"}: ${component.label} (${component.code})`);
  const components = [...componentLabels].sort(([a], [b]) => a.localeCompare(b));
  const company = run.payslips.find((payslip) => payslip.document)?.document?.branding.displayName || "Payroll register";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleNexa"; workbook.created = new Date(); workbook.subject = `Payroll register ${run.month}`;

  const summaryKeys = ["gross", "earnedGross", "deductions", "net"] as const;
  const grossKeys = ["gross", "earnedGross"] as const;
  const payoutKeys = ["deductions", "net"] as const;
  const attendanceKeys = ["payable", "present", "late", "half", "absent", "leave", "paidLeave", "unpaidLeave", "overtimeHours"] as const;
  const abstract = workbook.addWorksheet("Abstract");
  abstract.mergeCells("A1:F1"); abstract.getCell("A1").value = company; abstract.getCell("A1").font = { bold: true, size: 14 };
  abstract.mergeCells("A2:F2"); abstract.getCell("A2").value = `Payroll register for ${run.month} (${run.status})`;
  abstract.addRow([]); abstract.addRow(["Department", "Employees", "Gross earnings", "Earned gross", "Deductions", "Net pay"]); styleHeader(abstract.getRow(4));
  for (const [department, departmentRows] of Map.groupBy(rows, (row) => row.department)) abstract.addRow([department, departmentRows.length, ...summaryKeys.map((key) => departmentRows.reduce((total, row) => total + row[key], 0))]);
  const summaryEnd = abstract.rowCount + 1;
  abstract.addRow(["Total", rows.length, ...summaryKeys.map((key) => rows.reduce((total, row) => total + row[key], 0))]);
  const totalRow = abstract.getRow(summaryEnd); totalRow.font = { bold: true }; totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  abstract.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }];
  for (let index = 3; index <= 6; index++) abstract.getColumn(index).numFmt = moneyFormat;

  const usedNames = new Set(["Abstract"]);
  for (const [department, departmentRows] of Map.groupBy(rows, (row) => row.department)) {
    const sheet = workbook.addWorksheet(sheetName(department, usedNames));
    const headers = ["S. No.", "Employee Code", "Name", "Designation", "Date of Joining", "Payable Days", "Present", "Late", "Half Days", "Absent", "Leave", "Paid Leave", "Unpaid Leave", "Overtime Hours", "Contractual Gross", "Earned Gross", ...components.map(([, label]) => label), "Total Deductions", "Net Pay"];
    sheet.addRow([company]); sheet.mergeCells(1, 1, 1, headers.length); sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.addRow([`Payroll register for ${run.month} | Department: ${department} | Run: ${run.id}`]); sheet.mergeCells(2, 1, 2, headers.length);
    sheet.addRow([]); sheet.addRow(headers.map(safeCell)); styleHeader(sheet.getRow(4));
    departmentRows.forEach((row, index) => sheet.addRow([index + 1, row.employeeNumber, row.employeeName, row.designation, row.joiningDate, row.days.payable, row.days.present, row.days.late, row.days.half, row.days.absent, row.days.leave, row.days.paidLeave, row.days.unpaidLeave, row.days.overtimeHours, row.gross, row.earnedGross, ...components.map(([key]) => row.components.get(key)?.earned ?? 0), row.deductions, row.net].map(safeCell)));
    const end = sheet.rowCount + 1;
    sheet.addRow(["Total", "", "", "", "", ...attendanceKeys.map((key) => departmentRows.reduce((total, row) => total + row.days[key], 0)), ...grossKeys.map((key) => departmentRows.reduce((total, row) => total + row[key], 0)), ...components.map(([key]) => departmentRows.reduce((total, row) => total + (row.components.get(key)?.earned ?? 0), 0)), ...payoutKeys.map((key) => departmentRows.reduce((total, row) => total + row[key], 0))]);
    const total = sheet.getRow(end); total.font = { bold: true }; total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    sheet.views = [{ state: "frozen", ySplit: 4 }]; sheet.autoFilter = { from: "A4", to: `${columnName(headers.length)}4` };
    sheet.columns.forEach((column, index) => { column.width = index < 5 ? [8, 16, 24, 24, 14][index] : 14; });
    for (let index = 15; index <= headers.length; index++) sheet.getColumn(index).numFmt = moneyFormat;
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
