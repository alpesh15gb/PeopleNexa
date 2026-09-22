import ExcelJS from "exceljs";
import { dayRangeIST } from "@/lib/dates";

export const KEYSTONE_MANIPUR_2026_LEAVE_LEDGER = "keystone-manipur-2026-leave-ledger-v1";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "Septemer", "October", "November", "December"];

export type ParsedLeaveLedgerRow = {
  sourceRow: number;
  employeeNumber: string;
  employeeName: string;
  openingBalance: number;
  workedDays: number;
  credited: number;
  availed: number;
  available: number;
  errors: string[];
};

export type ParsedLeaveLedger = {
  schemaProfile: typeof KEYSTONE_MANIPUR_2026_LEAVE_LEDGER;
  throughMonth: string;
  periodEnd: Date;
  rows: ParsedLeaveLedgerRow[];
  errors: string[];
};

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
    const key = employeeNumber.toLocaleLowerCase();
    if (codes.has(key)) rowErrors.push("Duplicate employee code in workbook.");
    codes.add(key);
    const openingBalance = numberValue(sheet.getCell(row, 6).value);
    const workedDays = numberValue(sheet.getCell(row, firstMonthlyColumn).value);
    const credited = numberValue(sheet.getCell(row, firstMonthlyColumn + 1).value);
    const availed = numberValue(sheet.getCell(row, firstMonthlyColumn + 2).value);
    let available = numberValue(sheet.getCell(row, firstMonthlyColumn + 3).value);
    const values = { openingBalance, workedDays, credited, availed };
    for (const [name, value] of Object.entries(values)) if (value === null || value < 0) rowErrors.push(`${name} must be a non-negative number.`);
    let prior = openingBalance ?? 0;
    for (let month = 0; month <= monthIndex; month++) {
      const column = 7 + month * 4;
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
    rows.push({ sourceRow: row, employeeNumber, employeeName: text(sheet.getCell(row, 3).value), openingBalance: openingBalance ?? 0, workedDays: workedDays ?? 0, credited: credited ?? 0, availed: availed ?? 0, available: available ?? 0, errors: rowErrors });
  }
  if (!rows.length) errors.push("No employee rows were found below row 5.");
  return { schemaProfile: KEYSTONE_MANIPUR_2026_LEAVE_LEDGER, throughMonth, periodEnd: end, rows, errors };
}
