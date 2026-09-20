import "dotenv/config";
import { randomBytes } from "crypto";
import { readFile } from "fs/promises";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";

const DEFAULT_FILE = "MASTER-Employee-ALL.csv";
const PLACEHOLDER_RE = /^(?:select(?:\s+.*)?|n\/?a|na|null|nil|--|-|0+)$/i;

type SourceRow = Record<string, string>;

function text(value: string | undefined): string | null {
  const result = value?.trim() ?? "";
  return !result || PLACEHOLDER_RE.test(result) ? null : result;
}

function parseDate(value: string | undefined, field: string, rowNumber: number): Date | null {
  const source = text(value);
  if (!source) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(source);
  if (!match) throw new Error(`row ${rowNumber}: ${field} must use DD-MM-YYYY.`);
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    throw new Error(`row ${rowNumber}: ${field} is not a valid date.`);
  }
  return date;
}

function parseCsv(input: string): SourceRow[] {
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      cells.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    cells.push(row);
  }

  const headers = cells.shift()?.map((header) => header.replace(/^\uFEFF/, "").trim());
  if (!headers?.length || headers.some((header) => !header)) throw new Error("CSV has invalid headers.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV has duplicate headers.");

  return cells.filter((values) => values.some((value) => value.trim())).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`row ${index + 2}: expected ${headers.length} columns, found ${values.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

function sourceName(row: SourceRow): { firstName: string; lastName: string } {
  const firstName = text(row["RPT_First Name"]);
  const lastName = text(row["RPT_Last Name"]);
  if (firstName) return { firstName, lastName: lastName ?? text(row["RPT_Middle Name"]) ?? "" };
  const parts = (text(row.EmpName) ?? "").split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error("is missing a name.");
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function sourceEmail(row: SourceRow, employeeNumber: string): string {
  const email = text(row["RPT_Email ID"]);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email.toLowerCase();
  return `import-${Buffer.from(employeeNumber).toString("hex")}@device.local`;
}

function optionalNumber(value: string | undefined, field: string, rowNumber: number): number | null {
  const source = text(value);
  if (!source) return null;
  const number = Number(source.replace(/,/g, ""));
  if (!Number.isFinite(number) || number < 0) throw new Error(`row ${rowNumber}: ${field} must be a non-negative number.`);
  return number;
}

function drivingLicenseType(documentType: string | null, details: string | null): "commercial" | "permanent" | null {
  if (!documentType?.toLowerCase().includes("licen") || !details) return null;
  if (/(?:^|\W)(?:tr|transport)(?:\W|$)/i.test(details)) return "commercial";
  if (/(?:^|\W)(?:nt|non[-\s]?transport)(?:\W|$)/i.test(details)) return "permanent";
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sourcePath = process.argv.find((argument) => argument.startsWith("--file="))?.slice(7) ?? DEFAULT_FILE;
  const tenantSlug = process.argv.find((argument) => argument.startsWith("--tenant="))?.slice(9) ?? "ksipl";
  const rows = parseCsv(await readFile(sourcePath, "utf8"));
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, seats: true } });
  if (!tenant) throw new Error(`Tenant '${tenantSlug}' was not found.`);

  const existing = await prisma.employee.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, employeeNumber: true, deviceCode: true, email: true },
  });
  const byEmployeeNumber = new Map(existing.map((employee) => [employee.employeeNumber, employee]));
  const byDeviceCode = new Map(existing.filter((employee) => employee.deviceCode).map((employee) => [employee.deviceCode!, employee]));
  const byEmail = new Map(existing.flatMap((employee) => employee.email ? [[employee.email.toLowerCase(), employee] as const] : []));
  const seenEmployeeNumbers = new Set<string>();
  const seenDeviceCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const planned: Array<{ rowNumber: number; existingId: string | null; data: Prisma.EmployeeUncheckedCreateInput }> = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    try {
      const employeeNumber = text(row.EmpId);
      const deviceCode = text(row["RPT_Biometric ID"]);
      if (!employeeNumber || !deviceCode) throw new Error(`row ${rowNumber}: EmpId and RPT_Biometric ID are required.`);
      if (!seenEmployeeNumbers.add(employeeNumber)) throw new Error(`row ${rowNumber}: duplicate EmpId in source.`);
      if (!seenDeviceCodes.add(deviceCode)) throw new Error(`row ${rowNumber}: duplicate biometric ID in source.`);
      const { firstName, lastName } = sourceName(row);
      const email = sourceEmail(row, employeeNumber);
      if (!seenEmails.add(email)) throw new Error(`row ${rowNumber}: duplicate import email in source.`);
      const candidates = new Map<string, (typeof existing)[number]>();
      for (const candidate of [byEmployeeNumber.get(employeeNumber), byDeviceCode.get(deviceCode), byEmail.get(email)]) {
        if (candidate) candidates.set(candidate.id, candidate);
      }
      if (candidates.size > 1) throw new Error(`row ${rowNumber}: EmpId, biometric ID, or email resolves to different existing employees.`);
      const match = [...candidates.values()][0] ?? null;
      if (match?.deviceCode && match.deviceCode !== deviceCode) throw new Error(`row ${rowNumber}: existing employee has a different immutable device code.`);
      if (match && match.employeeNumber !== employeeNumber && byEmployeeNumber.has(employeeNumber)) throw new Error(`row ${rowNumber}: EmpId already belongs to another employee.`);
       const licenceType = text(row["ID_Document Type"]);
       const isLicence = licenceType?.toLowerCase().includes("licen") ?? false;
       const licenceCategory = drivingLicenseType(licenceType, text(row["ID_Licence / Registration Details"]));
      const rawAadhaar = text(row["RPT_Aadhaar Number"])?.replace(/[\s-]/g, "") ?? null;
      const aadhaar = rawAadhaar && /^\d{12}$/.test(rawAadhaar) ? rawAadhaar : null;
      if (rawAadhaar && !aadhaar) warnings.push(`row ${rowNumber}: Aadhaar number retained only in the import snapshot because it is invalid.`);
      const rawPan = text(row.OFF_panNo)?.toUpperCase() ?? null;
      const pan = rawPan && /^[A-Z]{5}\d{4}[A-Z]$/.test(rawPan) ? rawPan : null;
      if (rawPan && !pan) warnings.push(`row ${rowNumber}: PAN retained only in the import snapshot because it is invalid.`);
      const rawIfscCode = text(row["BANK_IFSC Code"])?.toUpperCase() ?? null;
      const ifscCode = rawIfscCode && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(rawIfscCode) ? rawIfscCode : null;
      if (rawIfscCode && !ifscCode) warnings.push(`row ${rowNumber}: IFSC code retained only in the import snapshot because it is invalid.`);
      const rawAccountNumber = text(row["BANK_Bank Account Number"]);
      const accountNumber = rawAccountNumber && /^\d{6,20}$/.test(rawAccountNumber) ? rawAccountNumber : null;
      if (rawAccountNumber && !accountNumber) warnings.push(`row ${rowNumber}: bank account number retained only in the import snapshot because it is invalid.`);
      planned.push({
        rowNumber,
        existingId: match?.id ?? null,
        data: {
          tenantId: tenant.id,
          employeeNumber,
          deviceCode,
          firstName,
          lastName,
          email,
          phone: text(row["RPT_Personal Mobile No"]),
          password: "",
          role: "employee",
          status: text(row.OFF_status)?.toLowerCase() === "active" ? "active" : "inactive",
          position: text(row["RPT_Designation"]),
          salary: optionalNumber(row.OFF_gross, "OFF_gross", rowNumber),
          joiningDate: parseDate(text(row["RPT_Joining Date"]) ? row["RPT_Joining Date"] : row.OFF_joiningDate, "joining date", rowNumber),
          bankName: text(row["BANK_Bank Name"]) ?? text(row["BANK_Name As Per Bank Records"]),
          accountNumber,
          ifscCode,
          pan,
          uan: text(row["RPT_UAN No"]),
          aadhaarNumber: aadhaar,
           drivingLicenseNumber: isLicence ? text(row["ID_Registered No"]) : null,
           drivingLicenseType: licenceCategory,
           drivingLicenseExpiresAt: isLicence ? parseDate(row["ID_Expiry Date"], "ID_Expiry Date", rowNumber) : null,
          legacyImportData: row as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `row ${rowNumber}: invalid data.`);
    }
  }

  const createCount = planned.filter((item) => !item.existingId).length;
  const updateCount = planned.length - createCount;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", rows: rows.length, createCount, updateCount, warnings, errors }, null, 2));
  if (errors.length || !apply) return;
  if (existing.length + createCount > tenant.seats) throw new Error(`Import needs ${createCount} new seats; tenant has ${tenant.seats} seats.`);

  const noLoginPassword = await hashPassword(randomBytes(32).toString("base64url"));
  await prisma.$transaction(
    planned.map(({ existingId, data }) => {
      if (existingId) {
        const { password: _password, tenantId: _tenantId, ...update } = data;
        return prisma.employee.update({ where: { id: existingId }, data: update });
      }
      return prisma.employee.create({ data: { ...data, password: noLoginPassword } });
    }),
    { timeout: 120_000 }
  );
  console.log(JSON.stringify({ imported: planned.length, created: createCount, updated: updateCount }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
