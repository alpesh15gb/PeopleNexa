import * as XLSX from "xlsx";
import type { AttendanceSummary } from "./payroll";
import { istDateKey } from "./ist";

export type ImportEmployee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: string; joiningDate: Date | null; payMode: string | null };
export type PayrollAttendanceFormat = "standard" | "legacy";
export type PayrollAttendanceRow = {
  format?: PayrollAttendanceFormat;
  rowNumber: number; code: string; name: string; employeeId: string | null;
  matchedCode: string | null; match: "exact" | "alias" | "unmatched" | "collision";
  marks: string[]; workDays: number; leaveDays: number; blankDays: number;
  earnedLeave: number; availableMonth: string; issues: string[]; blockers: string[];
};
export type ReviewedAttendanceRow = PayrollAttendanceRow & { excluded: boolean; blankAsUnpaid: boolean; reason: string };
export type ManualAttendanceSource = { uploadId: string; rowNumber: number; sourceCode: string; format?: PayrollAttendanceFormat; earnedLeave: number; availableMonth: string; reason: string; summary: AttendanceSummary };
const STANDARD_MARKS = ["P", "OD", "A", "HL", "PL", "UL", "WO", "H", ""];
const LEGACY_MARKS = ["P", "OD", "L", ""];
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
function payrollMonthDays(month: string) {
  const lastDay = new Date(`${month}-01T12:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  return lastDay.getUTCDate();
}
export function payrollAttendanceTemplate(month: string) {
  const workbook = XLSX.utils.book_new();
  const header = ["Employee Number", "Employee Name", ...Array.from({ length: payrollMonthDays(month) }, (_, i) => i + 1)];
  const worksheet = XLSX.utils.aoa_to_sheet([header]);
  worksheet["!cols"] = [{ wch: 18 }, { wch: 24 }];
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Payroll month", month],
    ["Employee number", "Use the number from the People directory. Format the cell as text to preserve leading zeros."],
    ["P", "Present"], ["OD", "On duty"], ["A", "Absent"], ["HL", "Half day worked, half day unpaid"],
    ["PL", "Paid leave for monthly employees"], ["UL", "Unpaid leave"], ["WO", "Weekly off"], ["H", "Holiday"],
    ["Blank", "A missing mark requires review. Keep days before joining blank."],
  ]);
  instructions["!cols"] = [{ wch: 20 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, `Attendance ${month}`);
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
export function previewPayrollAttendance(workbook: XLSX.WorkBook, sheet: string, month: string, employees: ImportEmployee[], format: PayrollAttendanceFormat = "standard") {
  const legacy = format === "legacy";
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error("Select a worksheet from this workbook.");
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  if (range.e.r > 10000 || range.e.c > 100) throw new Error("Worksheet exceeds 10,000 rows or 101 columns.");
  const values = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });
  const isCode = (cell: unknown) => (legacy ? ["empcode"] : ["employeenumber", "employeecode", "empcode"]).includes(heading(cell));
  const isName = (cell: unknown) => (legacy ? ["nameofemployee", "nameoftheemployee"] : ["employeename", "nameofemployee", "nameoftheemployee"]).includes(heading(cell));
  const headerIndex = values.slice(0, 20).findIndex(row => row.some(isCode) && row.some(isName));
  if (headerIndex < 0) throw new Error(legacy ? "Expected Emp Code and Name of Employee headers were not found." : "Expected Employee Number and Employee Name headers were not found.");
  const header = values[headerIndex];
  const codeColumn = header.findIndex(isCode);
  const nameColumn = header.findIndex(isName);
  const workColumn = header.findIndex(cell => heading(cell) === "workdays");
  const earnedColumn = legacy ? header.findIndex(cell => heading(cell).startsWith("leaves")) : -1;
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  for (const label of [sheet, text(header[earnedColumn])]) {
    const namedMonth = label.match(/\b\d{4}-(?:0[1-9]|1[0-2])\b/)?.[0];
    if (namedMonth && namedMonth !== month) throw new Error(`Worksheet identifies ${namedMonth}; selected payroll month is ${month}.`);
    const period = label.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.'-]*(\d{4}|\d{2})\b/);
    if (period) {
      const year = period[2].length === 2 ? `20${period[2]}` : period[2];
      const detected = `${year}-${String(monthNames.indexOf(period[1]) + 1).padStart(2, "0")}`;
      if (detected !== month) throw new Error(`Worksheet identifies ${detected}; selected payroll month is ${month}.`);
    }
  }
  const days = payrollMonthDays(month);
  const dayColumns = Array.from({ length: days }, (_, i) => header.findIndex(cell => text(cell) === String(i + 1)));
  const numberedDays = header.map(text).filter(cell => /^(?:[1-9]|[12]\d|3[01])$/.test(cell));
  if (dayColumns.some(column => column < 0) || (!legacy && numberedDays.length !== days) || (legacy && days < 31 && numberedDays.includes(String(days + 1)))) throw new Error("Worksheet day columns do not match the selected month.");
  const index = new Map<string, ImportEmployee[]>();
  for (const employee of employees) { const key = codeKey(employee.employeeNumber); index.set(key, [...(index.get(key) ?? []), employee]); }
  const rows: PayrollAttendanceRow[] = [];
  for (let r = headerIndex + 1; r < values.length; r++) {
    const value = values[r], code = text(value[codeColumn]);
    const marks = dayColumns.map(column => text(value[column]).toUpperCase());
    if (!code && (legacy || (!text(value[nameColumn]) && !marks.some(Boolean)))) continue;
    const exact = index.get(codeKey(code)) ?? [];
    const alias = legacy ? ylrAlias(code) : null;
    const aliases = alias ? index.get(alias) ?? [] : [];
    const candidates = [...new Map([...exact, ...aliases].map(employee => [employee.id, employee])).values()];
    const employee = candidates.length === 1 ? candidates[0] : null;
    const joiningDay = employee?.joiningDate ? istDateKey(employee.joiningDate) : null;
    const beforeJoining = (day: number) => joiningDay !== null && `${month}-${String(day + 1).padStart(2, "0")}` < joiningDay;
    const workDays = marks.filter(mark => mark === "P" || mark === "OD").length + marks.filter(mark => mark === "HL").length * 0.5;
    const blankDays = marks.filter((mark, day) => !mark && (legacy || !beforeJoining(day))).length;
    const earnedLeave = legacy ? earnedFromWorkDays(workDays) : 0;
    const blockers: string[] = [], issues: string[] = [];
    if (!code) blockers.push("Employee number is missing.");
    else if (!employee) blockers.push(candidates.length > 1 ? (legacy ? "Old/current codes belong to different employees." : "Employee number matches multiple records.") : "Employee code is unmatched.");
    if (marks.some(mark => !(legacy ? LEGACY_MARKS : STANDARD_MARKS).includes(mark))) blockers.push("Unsupported day mark. Correct the workbook.");
    if (employee?.payMode === "hourly") blockers.push("Hourly payroll requires verified hours; this workbook contains day marks only.");
    if (!legacy && employee?.payMode && employee.payMode !== "monthly" && marks.includes("PL")) blockers.push("Paid leave in the workbook requires monthly pay.");
    if (marks.some((mark, day) => mark && beforeJoining(day))) blockers.push("Attendance is recorded before the employee's joining date.");
    if (!legacy && beforeJoining(marks.length - 1)) blockers.push("Employee had not joined in this payroll month.");
    if (employee?.status !== "active" && employee) issues.push("Employee is inactive; review historical eligibility.");
    if (employee && heading(text(value[nameColumn])) !== heading(`${employee.firstName} ${employee.lastName}`)) issues.push(`Workbook name differs from PeopleNexa (${employee.firstName} ${employee.lastName}); verify identity.`);
    if (blankDays) issues.push(`${blankDays} blank day(s); exclude or explicitly treat as unpaid.`);
    const reportedWork = value[workColumn], reportedEarned = value[earnedColumn];
    if (workColumn >= 0 && (reportedWork == null || text(reportedWork) === "" || Number(reportedWork) !== workDays)) issues.push("Workbook Work Days differs from the counted work days.");
    if (legacy && (earnedColumn < 0 || reportedEarned == null || text(reportedEarned) === "" || Number(reportedEarned) !== earnedLeave)) issues.push("Workbook earned leave differs from the calculated 14/25 day tiers.");
    rows.push({ format, rowNumber: range.s.r + r + 1, code, name: text(value[nameColumn]), employeeId: employee?.id ?? null, matchedCode: employee?.employeeNumber ?? null, match: !employee ? candidates.length > 1 ? "collision" : "unmatched" : exact.length ? "exact" : "alias", marks, workDays, leaveDays: marks.filter(mark => ["L", "UL", "PL"].includes(mark)).length, blankDays, earnedLeave, availableMonth: nextPayrollMonth(month), issues, blockers });
  }
  if (!rows.length || rows.length > 1000) throw new Error("Select a sheet containing between 1 and 1,000 employees.");
  for (const row of rows) if (rows.some(other => other !== row && ((row.code && codeKey(other.code) === codeKey(row.code)) || (row.employeeId && other.employeeId === row.employeeId)))) row.blockers.push("Duplicate employee/code in this worksheet.");
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
  const standard = row.format === "standard";
  const marks = (mark: string) => row.marks.filter(value => value === mark).length;
  const halfDays = standard ? marks("HL") : 0;
  const paidLeaveDays = standard ? marks("PL") : 0;
  return {
    uploadId, rowNumber: row.rowNumber, sourceCode: row.code, ...(row.format ? { format: row.format } : {}), earnedLeave: row.earnedLeave, availableMonth: row.availableMonth, reason: row.reason,
    summary: {
      presentDays: standard ? marks("P") + marks("OD") : row.workDays,
      lateDays: 0,
      halfDays,
      absentDays: row.blankDays + (standard ? marks("A") : 0),
      onLeaveDays: row.leaveDays,
      paidLeaveDays,
      unpaidLeaveDays: row.leaveDays - paidLeaveDays,
      overtimeHours: 0,
      workingDays: row.marks.length - row.leaveDays - (standard ? marks("WO") + marks("H") : 0),
      workedHours: 0,
    },
  };
}
