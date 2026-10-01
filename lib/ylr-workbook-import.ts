import * as XLSX from "xlsx";

export const YLR_BRANCH_NAME = "YLR";
const EXCLUDED_SHEETS = /^(abstract|sheet\d*|on leaves|tds\b)/i;
const PLAN_VALUES = [800, 1000, 1500] as const;

export type YlrWorkbookRow = { sheet: string; rowNumber: number; employeeCode: string; name: string; designation: string; joiningDate: string | null; grossSalary: number; department: string; messPlan: 0 | 800 | 1000 | 1500 | null };
export type YlrWorkbookPreview = { rows: YlrWorkbookRow[]; sheets: string[]; exceptions: string[] };

function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function numberValue(value: unknown) { const parsed = Number(text(value).replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : null; }
function heading(value: unknown) { return text(value).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = text(value).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]); const month = Number(match[2]); const day = Number(match[1]); const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed.toISOString().slice(0, 10) : null;
}
function inferMessPlan(mess: number | null, days: number | null, present: number | null, payable: number | null): YlrWorkbookRow["messPlan"] {
  if (mess == null || mess === 0) return 0; if (!days || days <= 0) return null;
  const candidates = [present, payable].filter((value): value is number => value != null && value > 0).flatMap((value) => PLAN_VALUES.map((plan) => ({ plan, difference: Math.abs(plan - mess * days / value) }))).sort((a, b) => a.difference - b.difference)[0];
  return candidates && candidates.difference <= 75 ? candidates.plan : null;
}

export async function previewYlrWorkbook(buffer: ArrayBuffer): Promise<YlrWorkbookPreview> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true }); const rows: YlrWorkbookRow[] = []; const sheets: string[] = []; const exceptions: string[] = []; const seen = new Set<string>();
  for (const worksheetName of workbook.SheetNames) {
    if (EXCLUDED_SHEETS.test(worksheetName) || /\(\d+\)\s*$/.test(worksheetName)) continue;
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[worksheetName], { header: 1, raw: true, defval: null }); const combined = heading(values[0]?.[0]) === "sourcesheet"; const group = values[combined ? 0 : 4] ?? []; const header = values[combined ? 0 : 5] ?? []; const columns = new Map<string, number>();
    for (let column = 0; column < Math.max(group.length, header.length); column++) { const key = heading(header[column]) || heading(group[column]); if (key) columns.set(key, column); }
    const code = columns.get("empcode"), name = columns.get("name"), designation = columns.get("designation"), doj = columns.get("doj"), gross = columns.get("grosssalary"), source = columns.get("sourcesheet");
    if (code === undefined || name === undefined || designation === undefined || gross === undefined) continue;
    const find = (prefix: string) => [...columns.entries()].find(([key]) => key.startsWith(prefix))?.[1]; sheets.push(worksheetName.trim());
    for (let index = combined ? 1 : 6; index < values.length; index++) {
      const row = values[index] ?? []; const employeeCode = text(row[code]); if (!employeeCode || !/^YLR[/-]?\d+/i.test(employeeCode)) continue; const key = employeeCode.toUpperCase().replace(/[^A-Z0-9]/g, ""); const rowNumber = index + 1;
      if (seen.has(key)) exceptions.push(`${worksheetName.trim()} row ${rowNumber}: duplicate Emp Code ${employeeCode}; resolve before import.`); seen.add(key);
      const employeeName = text(row[name]), employeeDesignation = text(row[designation]), grossSalary = numberValue(row[gross]); if (!employeeName || !employeeDesignation || grossSalary == null || grossSalary < 0) { exceptions.push(`${worksheetName.trim()} row ${rowNumber}: incomplete employee details for ${employeeCode}; skipped.`); continue; }
      const messPlan = inferMessPlan(numberValue(row[find("mess") ?? -1]), numberValue(row[find("daysin") ?? -1]), numberValue(row[find("presentdays") ?? -1]), numberValue(row[find("totalpayabledays") ?? -1])); if (messPlan == null) exceptions.push(`${worksheetName.trim()} row ${rowNumber}: could not infer a Mess plan for ${employeeCode}.`);
      const department = combined ? text(row[source ?? -1]) || worksheetName.trim() : worksheetName.trim(); rows.push({ sheet: department, rowNumber, employeeCode, name: employeeName, designation: employeeDesignation, joiningDate: doj === undefined ? null : dateValue(row[doj]), grossSalary, department, messPlan });
    }
  }
  return { rows, sheets, exceptions };
}
