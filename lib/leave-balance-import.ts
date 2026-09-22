import ExcelJS from "exceljs";
import { dayRangeIST } from "@/lib/dates";

export const KEYSTONE_MANIPUR_2026_LEAVE_LEDGER = "keystone-manipur-2026-leave-ledger-v1";
export const PEOPLE_NEXA_LEAVE_BALANCE_FLAT = "peoplenexa-leave-balance-flat-v1";
export const LEAVE_BALANCE_FLAT_HEADERS = ["schema_profile", "employee_code", "employee_name", "designation", "joining_date", "opening_balance", "through_month", "worked_days", "credited", "availed", "available", "source_row"] as const;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "Septemer", "October", "November", "December"];

export type ParsedLeaveLedgerRow = {
  sourceRow: number;
  employeeNumber: string;
  employeeName: string;
  designation: string;
  joiningDate: string;
  openingBalance: number;
  workedDays: number;
  credited: number;
  availed: number;
  available: number;
  errors: string[];
};

export type ParsedLeaveLedger = {
  schemaProfile: typeof KEYSTONE_MANIPUR_2026_LEAVE_LEDGER | typeof PEOPLE_NEXA_LEAVE_BALANCE_FLAT;
  throughMonth: string;
  periodEnd: Date;
  rows: ParsedLeaveLedgerRow[];
  errors: string[];
};

export type LeaveLedgerEmployee = {
  id: string;
  employeeNumber: string;
  deviceCode: string | null;
};

export type LeaveLedgerEmployeeMatch<T extends LeaveLedgerEmployee = LeaveLedgerEmployee> =
  | { kind: "matched"; employee: T; matchedBy: "employeeNumber" | "id" | "deviceCode" }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; employees: LeaveLedgerEmployee[] };

// Ledger exports have historically varied in casing and accidental spacing.
// Employee codes do not use whitespace as a meaningful identifier character.
export function normalizeLeaveLedgerEmployeeCode(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function canConfirmLeaveBalanceImport(input: {
  blocking: boolean;
  structuralErrors: number;
  readyCount: number;
  excludedCount: number;
  reviewedExceptions: boolean;
  acknowledgedExceptionCount: number;
}) {
  if (!input.blocking) return { allowed: true, decision: "strict" as const };
  const allowed = input.reviewedExceptions
    && input.structuralErrors === 0
    && input.readyCount > 0
    && input.acknowledgedExceptionCount === input.excludedCount;
  return { allowed, decision: "reviewed_exceptions" as const };
}

export function matchLeaveLedgerEmployee<T extends LeaveLedgerEmployee>(code: string, employees: T[]): LeaveLedgerEmployeeMatch<T> {
  const normalizedCode = normalizeLeaveLedgerEmployeeCode(code);
  const matchingEmployees = new Map<string, T>();
  let matchedBy: "employeeNumber" | "id" | "deviceCode" | null = null;

  for (const field of ["employeeNumber", "id", "deviceCode"] as const) {
    const matches = employees.filter((employee) => {
      const value = employee[field];
      return typeof value === "string" && normalizeLeaveLedgerEmployeeCode(value) === normalizedCode;
    });
    for (const employee of matches) matchingEmployees.set(employee.id, employee);
    if (!matchedBy && matches.length) matchedBy = field;
  }

  const matches = [...matchingEmployees.values()];
  if (matches.length === 0) return { kind: "unmatched" };
  if (matches.length > 1) return { kind: "ambiguous", employees: matches };
  return { kind: "matched", employee: matches[0], matchedBy: matchedBy! };
}

function scalar(value: ExcelJS.CellValue | undefined): unknown {
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

function numberValue(value: ExcelJS.CellValue | undefined): number | null {
  const resolved = scalar(value);
  if (resolved === null || resolved === undefined || resolved === "") return 0;
  if (typeof resolved === "number" && Number.isFinite(resolved)) return resolved;
  const parsed = Number(String(resolved).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFormula(value: ExcelJS.CellValue | undefined) {
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}

function text(value: ExcelJS.CellValue | undefined) {
  const resolved = scalar(value);
  return String(resolved ?? "").trim();
}

function dateText(value: ExcelJS.CellValue | undefined) {
  const resolved = scalar(value);
  if (resolved instanceof Date && !Number.isNaN(resolved.getTime())) return resolved.toISOString().slice(0, 10);
  const valueText = String(resolved ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : "";
}

export function ledgerMonths() {
  return MONTH_NAMES.map((name, index) => ({ value: `2026-${String(index + 1).padStart(2, "0")}`, label: `${name === "Septemer" ? "September" : name} 2026` }));
}

export async function parseKeystoneLeaveLedger(buffer: ArrayBuffer, throughMonth: string): Promise<ParsedLeaveLedger> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length !== 1) throw new Error("This profile requires exactly one worksheet.");
  return parseKeystoneLeaveLedgerSheet(workbook.worksheets[0], throughMonth);
}

export function parseKeystoneLeaveLedgerSheet(sheet: ExcelJS.Worksheet, throughMonth: string): ParsedLeaveLedger {
  const monthIndex = ledgerMonths().findIndex((month) => month.value === throughMonth);
  if (monthIndex < 0) throw new Error("Choose a month in 2026.");
  const errors: string[] = [];
  if (text(sheet.getCell(3, 1).value) !== "Employee Leave Details For 2026") errors.push("Expected the title 'Employee Leave Details For 2026' in A3.");
  const expected = ["Sl No", "Employee Code", "Name Of Employee", "Designation", "Date Of Joining", "Leave Balance as on 31.12.2025"];
  expected.forEach((header, index) => { if (text(sheet.getCell(5, index + 1).value) !== header) errors.push(`Expected '${header}' in ${sheet.getCell(5, index + 1).address}.`); });
  const firstMonthlyColumn = 7 + monthIndex * 4;
  if (text(sheet.getCell(5, firstMonthlyColumn).value) !== "Working Days" || text(sheet.getCell(5, firstMonthlyColumn + 3).value) !== "Leave Balance") errors.push("The selected month does not have the required Working Days through Leave Balance columns.");

  const { end } = dayRangeIST(`${throughMonth}-${String(new Date(Date.UTC(2026, monthIndex + 1, 0)).getUTCDate()).padStart(2, "0")}`);
  const rows: ParsedLeaveLedgerRow[] = [];
  const codes = new Set<string>();
  for (let row = 6; row <= sheet.rowCount; row++) {
    const employeeNumber = text(sheet.getCell(row, 2).value);
    if (!employeeNumber) continue;
    const rowErrors: string[] = [];
    const key = normalizeLeaveLedgerEmployeeCode(employeeNumber);
    if (codes.has(key)) rowErrors.push("Duplicate employee code in workbook.");
    codes.add(key);
    const sourceOpeningBalance = numberValue(sheet.getCell(row, 6).value);
    const workedDays = numberValue(sheet.getCell(row, firstMonthlyColumn).value);
    const credited = numberValue(sheet.getCell(row, firstMonthlyColumn + 1).value);
    const availed = numberValue(sheet.getCell(row, firstMonthlyColumn + 2).value);
    let available = numberValue(sheet.getCell(row, firstMonthlyColumn + 3).value);
    const values = { sourceOpeningBalance, workedDays, credited, availed };
    for (const [name, value] of Object.entries(values)) if (value === null || value < 0) rowErrors.push(`${name} must be a non-negative number.`);
    let prior = sourceOpeningBalance ?? 0;
    let openingBalance = prior;
    for (let month = 0; month <= monthIndex; month++) {
      const column = 7 + month * 4;
      if (month === monthIndex) openingBalance = prior;
      const credit = numberValue(sheet.getCell(row, column + 1).value);
      const used = numberValue(sheet.getCell(row, column + 2).value);
      const balanceCell = sheet.getCell(row, column + 3).value;
      let balance = numberValue(balanceCell);
      // ExcelJS does not calculate formulas. A workbook may validly contain a
      // shared running-balance formula without a cached result, so derive it.
      if (balance === null && hasFormula(balanceCell) && credit !== null && used !== null) balance = prior + credit - used;
      if ([credit, used, balance].some((value) => value === null || value < 0)) { rowErrors.push(`Invalid values in ${ledgerMonths()[month].label}.`); continue; }
      const expectedBalance = prior + credit! - used!;
      if (Math.abs(expectedBalance - balance!) > 0.001) rowErrors.push(`${ledgerMonths()[month].label} balance does not reconcile to prior balance + credited - availed.`);
      prior = balance!;
    }
    if (available === null && hasFormula(sheet.getCell(row, firstMonthlyColumn + 3).value)) available = prior;
    rows.push({ sourceRow: row, employeeNumber, employeeName: text(sheet.getCell(row, 3).value), designation: text(sheet.getCell(row, 4).value), joiningDate: dateText(sheet.getCell(row, 5).value), openingBalance: openingBalance ?? 0, workedDays: workedDays ?? 0, credited: credited ?? 0, availed: availed ?? 0, available: available ?? 0, errors: rowErrors });
  }
  if (!rows.length) errors.push("No employee rows were found below row 5.");
  return { schemaProfile: KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, throughMonth, periodEnd: end, rows, errors };
}

function csvCells(source: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += char; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function csvNumber(value: string, column: string, errors: string[]) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) { errors.push(`${column} must be a non-negative decimal number.`); return 0; }
  return Number(value);
}

export function parseLeaveBalanceFlatCsv(source: string, selectedThroughMonth: string): ParsedLeaveLedger {
  const csvRows = csvCells(source.replace(/^\uFEFF/, ""));
  if (!csvRows.length) throw new Error("CSV is empty.");
  if (csvRows[0].length !== LEAVE_BALANCE_FLAT_HEADERS.length || csvRows[0].some((header, index) => header !== LEAVE_BALANCE_FLAT_HEADERS[index])) throw new Error(`CSV headers must exactly be: ${LEAVE_BALANCE_FLAT_HEADERS.join(", ")}.`);
  const errors: string[] = [];
  const rows: ParsedLeaveLedgerRow[] = [];
  const codes = new Set<string>();
  for (let line = 1; line < csvRows.length; line++) {
    const values = csvRows[line];
    if (values.every((value) => !value.trim())) continue;
    if (values.length !== LEAVE_BALANCE_FLAT_HEADERS.length) { errors.push(`CSV line ${line + 1} has ${values.length} columns; expected ${LEAVE_BALANCE_FLAT_HEADERS.length}.`); continue; }
    const [schemaProfile, employeeNumber, employeeName, designation, joiningDate, opening, throughMonth, worked, credited, availed, available, sourceRowText] = values.map((value) => value.trim());
    const rowErrors: string[] = [];
    if (schemaProfile !== PEOPLE_NEXA_LEAVE_BALANCE_FLAT) rowErrors.push(`schema_profile must be ${PEOPLE_NEXA_LEAVE_BALANCE_FLAT}.`);
    if (!employeeNumber) rowErrors.push("employee_code is required.");
    if (!employeeName) rowErrors.push("employee_name is required.");
    if (joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) rowErrors.push("joining_date must be YYYY-MM-DD or blank.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(throughMonth)) rowErrors.push("through_month must be YYYY-MM.");
    if (throughMonth !== selectedThroughMonth) rowErrors.push("through_month must match the selected cutoff month.");
    if (!/^\d+$/.test(sourceRowText) || Number(sourceRowText) < 1) rowErrors.push("source_row must be a positive integer.");
    const key = normalizeLeaveLedgerEmployeeCode(employeeNumber);
    if (codes.has(key)) rowErrors.push("Duplicate employee_code in CSV.");
    codes.add(key);
    const openingBalance = csvNumber(opening, "opening_balance", rowErrors);
    const workedDays = csvNumber(worked, "worked_days", rowErrors);
    const creditedValue = csvNumber(credited, "credited", rowErrors);
    const availedValue = csvNumber(availed, "availed", rowErrors);
    const availableValue = csvNumber(available, "available", rowErrors);
    if (Math.abs(openingBalance + creditedValue - availedValue - availableValue) > 0.001) rowErrors.push("available must reconcile to opening_balance + credited - availed.");
    rows.push({ sourceRow: Number(sourceRowText) || line + 1, employeeNumber, employeeName, designation, joiningDate, openingBalance, workedDays, credited: creditedValue, availed: availedValue, available: availableValue, errors: rowErrors });
  }
  if (!rows.length) errors.push("No data rows were found in the CSV.");
  const monthIndex = ledgerMonths().findIndex((month) => month.value === selectedThroughMonth);
  if (monthIndex < 0) errors.push("Selected cutoff month must be in 2026.");
  const periodEnd = dayRangeIST(`${selectedThroughMonth}-${String(new Date(Date.UTC(2026, monthIndex + 1, 0)).getUTCDate()).padStart(2, "0")}`).end;
  return { schemaProfile: PEOPLE_NEXA_LEAVE_BALANCE_FLAT, throughMonth: selectedThroughMonth, periodEnd, rows, errors };
}
