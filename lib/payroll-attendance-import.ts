import * as XLSX from "xlsx";
import type { AttendanceSummary } from "./payroll";
import { istDateKey } from "./ist";

export type ImportEmployee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: string; joiningDate: Date | null; payMode: string | null };
export type PayrollAttendanceRow = {
  rowNumber: number; code: string; name: string; employeeId: string | null;
  matchedCode: string | null; match: "exact" | "alias" | "unmatched" | "collision";
  marks: string[]; workDays: number; leaveDays: number; blankDays: number;
  earnedLeave: number; availableMonth: string; issues: string[]; blockers: string[];
};
export type ReviewedAttendanceRow = PayrollAttendanceRow & { excluded: boolean; blankAsUnpaid: boolean; reason: string };
export type ManualAttendanceSource = { uploadId: string; rowNumber: number; sourceCode: string; earnedLeave: number; availableMonth: string; reason: string; summary: AttendanceSummary };
const text = (value: unknown) => value == null ? "" : String(value).trim();
const heading = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
export const codeKey = (code: string) => code.trim().toUpperCase();
// The client replaced '/' with a literal zero, without removing leading zeros.
export function ylrAlias(code: string) {
  const key = codeKey(code);
  return /^YLR\/\d+$/.test(key) ? key.replace("/", "0") : /^YLR0\d+$/.test(key) ? key.replace(/^YLR0/, "YLR/") : null;
}
export function nextPayrollMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}`;
}
export const earnedFromWorkDays = (days: number) => days >= 25 ? 2 : days >= 14 ? 1 : 0;
export function readAttendanceWorkbook(bytes: Buffer) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true, dense: false });
  if (workbook.SheetNames.length > 100) throw new Error("Workbook has too many sheets.");
  return workbook;
}
export function previewPayrollAttendance(workbook: XLSX.WorkBook, sheet: string, month: string, employees: ImportEmployee[]) {
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error("Select a worksheet from this workbook.");
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  if (range.e.r > 10000 || range.e.c > 100) throw new Error("Worksheet exceeds 10,000 rows or 101 columns.");
  const values = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });
  const isName = (cell: unknown) => ["nameofemployee", "nameoftheemployee"].includes(heading(cell));
  const headerIndex = values.slice(0, 20).findIndex(row => row.some(cell => heading(cell) === "empcode") && row.some(isName));
  if (headerIndex < 0) throw new Error("Expected Emp Code and Name of Employee headers were not found.");
  const header = values[headerIndex];
  const codeColumn = header.findIndex(cell => heading(cell) === "empcode");
  const nameColumn = header.findIndex(isName);
  const workColumn = header.findIndex(cell => heading(cell) === "workdays");
  const earnedColumn = header.findIndex(cell => heading(cell).startsWith("leaves"));
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  for (const label of [sheet, text(header[earnedColumn])]) {
    const period = label.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.'-]*(\d{4}|\d{2})\b/);
    if (period) {
      const year = period[2].length === 2 ? `20${period[2]}` : period[2];
      const detected = `${year}-${String(monthNames.indexOf(period[1]) + 1).padStart(2, "0")}`;
      if (detected !== month) throw new Error(`Worksheet identifies ${detected}; selected payroll month is ${month}.`);
    }
  }
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const dayColumns = Array.from({ length: days }, (_, i) => header.findIndex(cell => text(cell) === String(i + 1)));
  if (dayColumns.some(column => column < 0) || new Set(dayColumns).size !== days || (days < 31 && header.some(cell => text(cell) === String(days + 1)))) throw new Error("Worksheet day columns do not match the selected month.");
  const index = new Map<string, ImportEmployee[]>();
  for (const employee of employees) { const key = codeKey(employee.employeeNumber); index.set(key, [...(index.get(key) ?? []), employee]); }
  const rows: PayrollAttendanceRow[] = [];
  for (let r = headerIndex + 1; r < values.length; r++) {
    const value = values[r], code = text(value[codeColumn]);
    if (!code) continue;
    const exact = index.get(codeKey(code)) ?? [];
    const alias = ylrAlias(code); const aliases = alias ? index.get(alias) ?? [] : [];
    const candidates = [...new Map([...exact, ...aliases].map(employee => [employee.id, employee])).values()];
    const employee = candidates.length === 1 ? candidates[0] : null;
    const marks = dayColumns.map(column => text(value[column]).toUpperCase());
    const workDays = marks.filter(mark => mark === "P" || mark === "OD").length;
    const blankDays = marks.filter(mark => !mark).length;
    const earnedLeave = earnedFromWorkDays(workDays);
    const blockers: string[] = [], issues: string[] = [];
    if (!employee) blockers.push(candidates.length > 1 ? "Old/current codes belong to different employees." : "Employee code is unmatched.");
    if (marks.some(mark => !["P", "OD", "L", ""].includes(mark))) blockers.push("Unsupported day mark; correct the workbook.");
    if (employee?.payMode === "hourly") blockers.push("Hourly payroll requires verified hours; this workbook contains day marks only.");
    if (employee?.joiningDate && marks.some((mark, day) => mark && `${month}-${String(day + 1).padStart(2, "0")}` < istDateKey(employee.joiningDate!))) blockers.push("Attendance is recorded before the employee's joining date.");
    if (employee?.status !== "active" && employee) issues.push("Employee is inactive; review historical eligibility.");
    if (employee && heading(text(value[nameColumn])) !== heading(`${employee.firstName} ${employee.lastName}`)) issues.push(`Workbook name differs from PeopleNexa (${employee.firstName} ${employee.lastName}); verify identity.`);
    if (blankDays) issues.push(`${blankDays} blank day(s); exclude or explicitly treat as unpaid.`);
    const reportedWork = value[workColumn], reportedEarned = value[earnedColumn];
    if (workColumn >= 0 && (reportedWork == null || text(reportedWork) === "" || Number(reportedWork) !== workDays)) issues.push("Workbook Work Days differs from the counted P + OD days.");
    if (earnedColumn < 0 || reportedEarned == null || text(reportedEarned) === "" || Number(reportedEarned) !== earnedLeave) issues.push("Workbook earned leave differs from the calculated 14/25 day tiers.");
    rows.push({ rowNumber: r + 1, code, name: text(value[nameColumn]), employeeId: employee?.id ?? null, matchedCode: employee?.employeeNumber ?? null, match: !employee ? candidates.length > 1 ? "collision" : "unmatched" : exact.length ? "exact" : "alias", marks, workDays, leaveDays: marks.filter(mark => mark === "L").length, blankDays, earnedLeave, availableMonth: nextPayrollMonth(month), issues, blockers });
  }
  if (!rows.length || rows.length > 1000) throw new Error("Select a sheet containing between 1 and 1,000 employees.");
  for (const row of rows) if (rows.some(other => other !== row && (codeKey(other.code) === codeKey(row.code) || (row.employeeId && other.employeeId === row.employeeId)))) row.blockers.push("Duplicate employee/code in this worksheet.");
  return rows;
}
export function reviewAttendanceRows(rows: PayrollAttendanceRow[], decisions: Array<{ rowNumber: number; excluded?: boolean; blankAsUnpaid?: boolean; reason?: string }>): ReviewedAttendanceRow[] {
  const byRow = new Map(decisions.map(decision => [decision.rowNumber, decision]));
  const reviewed = rows.map(row => {
    const decision = byRow.get(row.rowNumber);
    if (!decision) throw new Error(`Review row ${row.rowNumber}.`);
    const excluded = decision.excluded === true, reason = text(decision.reason).slice(0, 1000);
    if (!excluded && row.blockers.length) throw new Error(`Row ${row.rowNumber}: ${row.blockers.join(" ")}`);
    if (!excluded && row.blankDays && decision.blankAsUnpaid !== true) throw new Error(`Row ${row.rowNumber}: resolve blank days.`);
    if ((excluded || row.issues.length) && !reason) throw new Error(`Row ${row.rowNumber}: a review reason is required.`);
    return { ...row, excluded, blankAsUnpaid: decision.blankAsUnpaid === true, reason };
  });
  if (!reviewed.some(row => !row.excluded)) throw new Error("Include at least one employee.");
  return reviewed;
}
export function manualAttendanceSource(uploadId: string, row: ReviewedAttendanceRow): ManualAttendanceSource {
  if (row.excluded || !row.employeeId || row.blockers.length || (row.blankDays && !row.blankAsUnpaid)) throw new Error("Attendance row has not passed review.");
  return { uploadId, rowNumber: row.rowNumber, sourceCode: row.code, earnedLeave: row.earnedLeave, availableMonth: row.availableMonth, reason: row.reason, summary: { presentDays: row.workDays, lateDays: 0, halfDays: 0, absentDays: row.blankDays, onLeaveDays: row.leaveDays, paidLeaveDays: 0, unpaidLeaveDays: row.leaveDays, overtimeHours: 0, workingDays: row.marks.length - row.leaveDays, workedHours: 0 } };
}
