import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

const statuses = new Set(["available", "maintenance", "retired", "lost"]);
const key = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

function csvRows(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < source.length; i++) { const char = source[i]; const next = source[i + 1]; if (char === '"' && quoted && next === '"') { cell += char; i++; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

function valueOf(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  return String(value);
}

function parseDate(value: string) {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)?.slice().reverse() as RegExpExecArray | null;
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV or XLSX file." }, { status: 400 });

  let rows: string[][];
  try {
    if (/\.xlsx$/i.test(file.name)) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0]; rows = sheet ? sheet.getSheetValues().slice(1).map((row) => Array.isArray(row) ? row.slice(1).map((cell) => valueOf(cell)) : []) : []; }
    else rows = csvRows(await file.text());
  } catch { return NextResponse.json({ error: "Could not read the import file." }, { status: 400 }); }
  if (rows.length < 2) return NextResponse.json({ error: "The file must have a header row and at least one asset." }, { status: 400 });

  const headers = rows.shift()!.map(key); const column = (...names: string[]) => names.map(key).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const nameColumn = column("name", "assetname");
  if (nameColumn < 0) return NextResponse.json({ error: "A Name or Asset Name column is required." }, { status: 400 });
  const categoryColumn = column("category"); const tagColumn = column("tag", "assettag"); const serialColumn = column("serialnumber", "serial"); const photoColumn = column("photourl", "photo"); const valueColumn = column("value", "purchasevalue"); const dateColumn = column("purchasedate"); const conditionColumn = column("condition"); const warrantyColumn = column("warrantyexpiry", "warrantyend"); const maintenanceDueColumn = column("maintenancedue", "nextservicedate"); const statusColumn = column("status"); const notesColumn = column("notes", "note"); const employeeColumn = column("employeenumber", "employeeid", "assigneecode");
  const employees = employeeColumn >= 0 ? await prisma.employee.findMany({ where: { tenantId: session.tenantId, status: "active", ...(locationId ? employeeLocationScope(locationId) : {}) }, select: { id: true, employeeNumber: true } }) : [];
  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber.toLowerCase(), employee]));
  let created = 0; let assigned = 0; const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const at = (columnIndex: number) => columnIndex < 0 ? "" : String(row[columnIndex] ?? "").trim();
    const name = at(nameColumn); if (!name) { errors.push(`Row ${index + 2}: asset name is required.`); continue; }
    const employeeNumber = at(employeeColumn); const employee = employeeNumber ? employeeByNumber.get(employeeNumber.toLowerCase()) : null;
    if (employeeNumber && !employee) { errors.push(`Row ${index + 2}: employee ${employeeNumber} was not found or is inactive.`); continue; }
    const requestedStatus = at(statusColumn).toLowerCase(); const status = employee ? "assigned" : (statuses.has(requestedStatus) ? requestedStatus : "available");
    const value = at(valueColumn) ? Number(at(valueColumn).replace(/,/g, "")) : null;
    try {
      const condition = at(conditionColumn).toLowerCase();
       await prisma.$transaction(async (tx) => { const asset = await tx.asset.create({ data: { tenantId: session.tenantId, locationId, name, category: at(categoryColumn) || "other", tag: at(tagColumn) || null, serialNumber: at(serialColumn) || null, photoUrl: at(photoColumn) || null, value: value != null && Number.isFinite(value) ? value : null, purchaseDate: parseDate(at(dateColumn)), condition: ["new", "good", "fair", "poor", "damaged"].includes(condition) ? condition : "good", warrantyExpiry: parseDate(at(warrantyColumn)), maintenanceDue: parseDate(at(maintenanceDueColumn)), status, notes: at(notesColumn) || null } }); if (employee) await tx.assetAssignment.create({ data: { assetId: asset.id, employeeId: employee.id, assignedBy: session.sub, note: "Imported assignment" } }); });
      created++; if (employee) assigned++;
    } catch (error) { errors.push(`Row ${index + 2}: ${(error as { code?: string }).code === "P2002" ? "asset tag already exists." : "could not be imported."}`); }
  }
  return NextResponse.json({ created, assigned, skipped: errors.length, errors: errors.slice(0, 20) });
}
