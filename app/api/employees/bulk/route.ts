import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { randomBytes } from "crypto";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 2500;
const PAY_MODES = new Set(["monthly", "daily", "weekly", "hourly", "work_basis"]);
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UAN_RE = /^\d{12}$/;
const ACCOUNT_RE = /^[0-9]{6,20}$/;
const MIN_JOINING_MS = Date.parse("1990-01-01T00:00:00Z");

function joiningDateRangeError(d: Date): string | null {
  if (d.getTime() < MIN_JOINING_MS) return "Joining date cannot be before 1990-01-01.";
  if (d.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    return "Joining date cannot be more than 90 days in the future.";
  }
  return null;
}

function salaryStructureError(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    return "Salary structure must be an object of non-negative numbers.";
  }
  for (const n of Object.values(v as Record<string, unknown>)) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
      return "Salary structure must contain only non-negative numbers.";
    }
  }
  return null;
}
const TEMPLATE_HEADERS = [
  "employeeNumber",
  "deviceCode",
  "firstName",
  "lastName",
  "email",
  "phone",
  "position",
  "salary",
  "joiningDate",
  "branch",
  "department",
  "shiftId",
  "payMode",
  "workBasisRate",
  "managerId",
  "status",
  "bankName",
  "accountNumber",
  "ifscCode",
  "pan",
  "uan",
  "basicSalary",
  "hra",
  "conveyance",
  "medical",
  "otherAllowance",
] as const;

function genPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const buf = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const csv = TEMPLATE_HEADERS.join(",") + "\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="employees-template.csv"',
    },
  });
}

interface BulkRow {
  employeeNumber?: unknown;
  deviceCode?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  position?: unknown;
  salary?: unknown;
  joiningDate?: unknown;
  branchId?: unknown;
  branch?: unknown;
  departmentId?: unknown;
  department?: unknown;
  shiftId?: unknown;
  payMode?: unknown;
  workBasisRate?: unknown;
  managerId?: unknown;
  status?: unknown;
  bankName?: unknown;
  accountNumber?: unknown;
  ifscCode?: unknown;
  pan?: unknown;
  uan?: unknown;
  basicSalary?: unknown;
  hra?: unknown;
  conveyance?: unknown;
  medical?: unknown;
  otherAllowance?: unknown;
}

function assignmentName(value: unknown): string {
  return value != null ? String(value).trim() : "";
}

async function resolveBranch(tenantId: string, value: string): Promise<string | null> {
  if (!value) return null;
  const existing = await prisma.branch.findFirst({
    where: { tenantId, OR: [{ id: value }, { name: { equals: value, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  const base = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "BRANCH";
  let code = base;
  for (let suffix = 2; ; suffix++) {
    const clash = await prisma.branch.findFirst({ where: { tenantId, code }, select: { id: true } });
    if (!clash) break;
    code = `${base.slice(0, 16)}${suffix}`.slice(0, 20);
  }
  return (await prisma.branch.create({ data: { tenantId, name: value, code } })).id;
}

async function resolveDepartment(tenantId: string, value: string): Promise<string | null> {
  if (!value) return null;
  const existing = await prisma.department.findFirst({
    where: { tenantId, OR: [{ id: value }, { name: { equals: value, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  return (await prisma.department.create({ data: { tenantId, name: value } })).id;
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const rows = body?.rows;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array." }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS}).` },
      { status: 400 }
    );
  }

  const [count, tenant] = await Promise.all([
    prisma.employee.count({ where: { tenantId: session.tenantId } }),
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { seats: true },
    }),
  ]);
  const seats = tenant?.seats ?? 0;
  let created = 0;
  let updated = 0;
  const failed: { email: string; error: string }[] = [];
  const seenInBatch = new Set<string>();
  const importPassword = await hashPassword(genPassword());

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as BulkRow;
    const email = String(raw?.email ?? "").toLowerCase().trim();
    try {
      const employeeNumberInput = raw?.employeeNumber ? String(raw.employeeNumber).trim() : "";
      const deviceCodeInput = raw?.deviceCode ? String(raw.deviceCode).trim() : "";
      const rowKey = deviceCodeInput || employeeNumberInput || email;
      if (!rowKey) throw new Error("Provide Device Code or Employee Code to identify the employee.");
      if (seenInBatch.has(rowKey)) throw new Error("Duplicate Device Code or Employee Code in this file.");
      seenInBatch.add(rowKey);
      const existingForRow = await prisma.employee.findFirst({
        where: {
          tenantId: session.tenantId,
          OR: [
            ...(deviceCodeInput ? [{ deviceCode: deviceCodeInput }] : []),
            ...(employeeNumberInput ? [{ employeeNumber: employeeNumberInput }] : []),
            ...(email ? [{ email }] : []),
          ],
        },
      });
      const firstName = String(raw?.firstName ?? "").trim();
      if (!firstName && !existingForRow) throw new Error("First name is required for a new employee.");
      if (firstName.length > 100) throw new Error("First name must be at most 100 characters.");
      const bulkLastRaw = raw?.lastName !== undefined && raw?.lastName !== null ? String(raw.lastName) : "";
      const bulkLastName = bulkLastRaw.trim();
      if (bulkLastRaw !== "" && !bulkLastName) throw new Error("Last name cannot be empty.");
      if (bulkLastName.length > 100) throw new Error("Last name must be at most 100 characters.");
      if (raw?.position != null && String(raw.position).length > 100) {
        throw new Error("Position must be at most 100 characters.");
      }
      if (email && !EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");

      const salary =
        raw?.salary != null && raw.salary !== "" ? Number(raw.salary) : null;
      if (
        salary != null &&
        (!Number.isFinite(salary) || salary < 0 || salary > 100_000_000)
      ) {
        throw new Error("Salary must be a number between 0 and 10,00,00,000.");
      }
      const workBasisRate = raw?.workBasisRate != null && raw.workBasisRate !== "" ? Number(raw.workBasisRate) : null;
      if (workBasisRate != null && (!Number.isFinite(workBasisRate) || workBasisRate < 0)) throw new Error("Work-basis rate must be a non-negative number.");

      let joiningDate: Date | null = null;
      if (raw?.joiningDate) {
        const d = new Date(String(raw.joiningDate));
        if (Number.isNaN(d.getTime())) throw new Error("Joining date is invalid.");
        const rangeErr = joiningDateRangeError(d);
        if (rangeErr) throw new Error(rangeErr);
        joiningDate = d;
      }

      let bulkPhone: string | null = null;
      if (raw?.phone != null && String(raw.phone).trim() !== "") {
        bulkPhone = String(raw.phone).trim();
        if (!PHONE_RE.test(bulkPhone.replace(/[\s-]/g, ""))) {
          throw new Error("Enter a valid phone number.");
        }
      }

      const extra = raw as Record<string, unknown>;
      const bankName = extra.bankName != null && String(extra.bankName).trim() !== "" ? String(extra.bankName).trim() : null;
      if (bankName && bankName.length > 100) throw new Error("Bank name must be at most 100 characters.");
      const bulkPan = extra.pan != null && String(extra.pan).trim() !== "" ? String(extra.pan).trim().toUpperCase() : null;
      if (bulkPan != null && !PAN_RE.test(bulkPan)) throw new Error("Enter a valid PAN (e.g. ABCDE1234F).");
      const bulkIfsc = extra.ifscCode != null && String(extra.ifscCode).trim() !== "" ? String(extra.ifscCode).trim().toUpperCase() : null;
      if (bulkIfsc != null && !IFSC_RE.test(bulkIfsc)) throw new Error("Enter a valid IFSC code (e.g. HDFC0001234).");
      const bulkUan = extra.uan != null && String(extra.uan).trim() !== "" ? String(extra.uan).trim() : null;
      if (bulkUan != null && !UAN_RE.test(bulkUan)) throw new Error("UAN must be a 12-digit number.");
      const bulkAccount = extra.accountNumber != null && String(extra.accountNumber).trim() !== "" ? String(extra.accountNumber).trim() : null;
      if (bulkAccount != null && !ACCOUNT_RE.test(bulkAccount)) throw new Error("Account number must be 6–20 digits.");
      const bulkSsErr = salaryStructureError(extra.salaryStructure);
      if (bulkSsErr) throw new Error(bulkSsErr);
      const componentFields = [["basic", raw?.basicSalary], ["hra", raw?.hra], ["conveyance", raw?.conveyance], ["medical", raw?.medical], ["other", raw?.otherAllowance]] as const;
      const salaryStructure: Record<string, number> = {};
      for (const [key, value] of componentFields) {
        if (value == null || value === "") continue;
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0) throw new Error(`${key} salary component must be a non-negative number.`);
        salaryStructure[key] = amount;
      }

      // Preferred CSV columns are human-readable branch/department names.
      // Legacy branchId/departmentId values work too, as either IDs or names.
      const branchValue = assignmentName(raw?.branch) || assignmentName(raw?.branchId);
      const departmentValue = assignmentName(raw?.department) || assignmentName(raw?.departmentId);
      const shiftId = raw?.shiftId ? String(raw.shiftId).trim() : "";
      const managerId = raw?.managerId ? String(raw.managerId).trim() : "";

      const [branchId, departmentId, shift, manager] = await Promise.all([
        resolveBranch(session.tenantId, branchValue),
        resolveDepartment(session.tenantId, departmentValue),
        shiftId
          ? prisma.shift.findFirst({
              where: { id: shiftId, tenantId: session.tenantId },
              select: { id: true },
            })
          : null,
        managerId ? prisma.employee.findFirst({ where: { id: managerId, tenantId: session.tenantId }, select: { id: true } }) : null,
      ]);
      if (shiftId && !shift) throw new Error("Shift not found in this workspace.");
      if (managerId && !manager) throw new Error("Manager not found in this workspace.");

      const payMode = raw?.payMode ? String(raw.payMode).trim() || "monthly" : "monthly";
      if (!PAY_MODES.has(payMode)) {
        throw new Error("Pay mode must be one of monthly, daily, weekly, hourly, work_basis.");
      }
      const status = raw?.status ? String(raw.status).trim().toLowerCase() : "active";
      if (status !== "active" && status !== "inactive") throw new Error("Status must be active or inactive.");
      const employeeNumber = employeeNumberInput || deviceCodeInput || `EMP-${String(count + i + 1).padStart(3, "0")}`;
      if (!employeeNumber || employeeNumber.length > 100) throw new Error("Employee number must be 1–100 characters.");
      const deviceCode = deviceCodeInput || null;
      if (deviceCode && deviceCode.length > 100) throw new Error("Device Code must be at most 100 characters.");

      if (existingForRow) {
        const currentStructure = existingForRow.salaryStructure && typeof existingForRow.salaryStructure === "object" && !Array.isArray(existingForRow.salaryStructure)
          ? existingForRow.salaryStructure as Record<string, unknown>
          : {};
        await prisma.employee.update({
          where: { id: existingForRow.id },
          data: {
            employeeNumber: employeeNumberInput || existingForRow.employeeNumber,
            deviceCode: deviceCodeInput || existingForRow.deviceCode,
            ...(firstName ? { firstName } : {}),
            ...(bulkLastRaw !== "" && bulkLastName ? { lastName: bulkLastName } : {}),
            ...(email ? { email } : {}),
            ...(raw?.phone != null && String(raw.phone).trim() !== "" ? { phone: bulkPhone } : {}),
            ...(raw?.position != null && String(raw.position).trim() !== "" ? { position: String(raw.position).trim() } : {}),
            ...(raw?.salary != null && raw.salary !== "" ? { salary } : {}),
            ...(joiningDate ? { joiningDate } : {}),
            ...(branchId ? { branchId } : {}), ...(departmentId ? { departmentId } : {}), ...(shiftId ? { shiftId } : {}), ...(managerId ? { managerId } : {}),
            ...(raw?.payMode ? { payMode } : {}), ...(raw?.workBasisRate != null && raw.workBasisRate !== "" ? { workBasisRate } : {}), ...(raw?.status ? { status } : {}),
            ...(bankName ? { bankName } : {}), ...(bulkPan ? { pan: bulkPan } : {}), ...(bulkUan ? { uan: bulkUan } : {}), ...(bulkIfsc ? { ifscCode: bulkIfsc } : {}), ...(bulkAccount ? { accountNumber: bulkAccount } : {}),
            ...(Object.keys(salaryStructure).length ? { salaryStructure: { ...currentStructure, ...salaryStructure } as Prisma.InputJsonValue } : {}),
          },
        });
        updated++;
        continue;
      }
      if (count + created >= seats) throw new Error(`Seat limit reached (${seats}).`);
      const newEmail = email || `import-${Buffer.from(employeeNumber).toString("hex")}@device.local`;

      await prisma.employee.create({
        data: {
          tenantId: session.tenantId,
          employeeNumber,
          deviceCode,
          firstName,
          lastName: bulkLastName,
          email: newEmail,
          phone: bulkPhone,
          password: importPassword,
          role: "employee",
          position: raw?.position ? String(raw.position) : null,
          salary,
          joiningDate,
          branchId: branchId || null,
          departmentId: departmentId || null,
          shiftId: shiftId || null,
          payMode,
          workBasisRate,
          managerId: managerId || null,
          status,
          bankName,
          pan: bulkPan,
          uan: bulkUan,
          ifscCode: bulkIfsc,
          accountNumber: bulkAccount,
          salaryStructure: Object.keys(salaryStructure).length ? (salaryStructure as Prisma.InputJsonValue) : extra.salaryStructure !== undefined && extra.salaryStructure !== null && extra.salaryStructure !== "" ? (extra.salaryStructure as Prisma.InputJsonValue) : undefined,
        },
      });
      created++;
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        const t = (err as { meta?: { target?: unknown } })?.meta?.target;
        const targets = Array.isArray(t) ? t.map(String) : [];
        failed.push({
          email: email || `(row ${i + 1})`,
          error: targets.includes("email")
            ? "An employee with this email already exists."
            : "Duplicate entry — please retry.",
        });
        continue;
      }
      failed.push({
        email: email || `(row ${i + 1})`,
        error: err instanceof Error ? err.message : "Failed to import row.",
      });
    }
  }

  return NextResponse.json({ created, updated, failed });
}
