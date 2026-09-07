import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { randomBytes } from "crypto";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 500;
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
  "firstName",
  "lastName",
  "email",
  "phone",
  "position",
  "salary",
  "joiningDate",
  "branchId",
  "departmentId",
  "shiftId",
  "payMode",
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
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  position?: unknown;
  salary?: unknown;
  joiningDate?: unknown;
  branchId?: unknown;
  departmentId?: unknown;
  shiftId?: unknown;
  payMode?: unknown;
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
  if (count + rows.length > seats) {
    return NextResponse.json(
      {
        error: `Seat limit exceeded (${seats} seats, ${count} used, ${rows.length} to import). Please upgrade to add more employees.`,
      },
      { status: 403 }
    );
  }

  let created = 0;
  const failed: { email: string; error: string }[] = [];
  const seenInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as BulkRow;
    const email = String(raw?.email ?? "").toLowerCase().trim();
    try {
      const firstName = String(raw?.firstName ?? "").trim();
      if (!firstName) throw new Error("First name is required.");
      if (firstName.length > 100) throw new Error("First name must be at most 100 characters.");
      const bulkLastRaw = raw?.lastName !== undefined && raw?.lastName !== null ? String(raw.lastName) : "";
      const bulkLastName = bulkLastRaw.trim();
      if (bulkLastRaw !== "" && !bulkLastName) throw new Error("Last name cannot be empty.");
      if (bulkLastName.length > 100) throw new Error("Last name must be at most 100 characters.");
      if (raw?.position != null && String(raw.position).length > 100) {
        throw new Error("Position must be at most 100 characters.");
      }
      if (!email || !EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
      if (seenInBatch.has(email)) throw new Error("Duplicate email in this file.");
      seenInBatch.add(email);

      const salary =
        raw?.salary != null && raw.salary !== "" ? Number(raw.salary) : null;
      if (
        salary != null &&
        (!Number.isFinite(salary) || salary < 0 || salary > 100_000_000)
      ) {
        throw new Error("Salary must be a number between 0 and 10,00,00,000.");
      }

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

      const branchId = raw?.branchId ? String(raw.branchId).trim() : "";
      const departmentId = raw?.departmentId ? String(raw.departmentId).trim() : "";
      const shiftId = raw?.shiftId ? String(raw.shiftId).trim() : "";

      const [branch, department, shift] = await Promise.all([
        branchId
          ? prisma.branch.findFirst({
              where: { id: branchId, tenantId: session.tenantId },
              select: { id: true },
            })
          : null,
        departmentId
          ? prisma.department.findFirst({
              where: { id: departmentId, tenantId: session.tenantId },
              select: { id: true },
            })
          : null,
        shiftId
          ? prisma.shift.findFirst({
              where: { id: shiftId, tenantId: session.tenantId },
              select: { id: true },
            })
          : null,
      ]);
      if (branchId && !branch) throw new Error("Branch not found in this workspace.");
      if (departmentId && !department)
        throw new Error("Department not found in this workspace.");
      if (shiftId && !shift) throw new Error("Shift not found in this workspace.");

      const exists = await prisma.employee.findFirst({
        where: { tenantId: session.tenantId, email },
        select: { id: true },
      });
      if (exists) throw new Error("An employee with this email already exists.");

      const payMode = raw?.payMode ? String(raw.payMode).trim() || "monthly" : "monthly";
      if (!PAY_MODES.has(payMode)) {
        throw new Error("Pay mode must be one of monthly, daily, weekly, hourly, work_basis.");
      }

      await prisma.employee.create({
        data: {
          tenantId: session.tenantId,
          employeeNumber: `EMP-${String(count + i + 1).padStart(3, "0")}`,
          firstName,
          lastName: bulkLastName,
          email,
          phone: bulkPhone,
          password: await hashPassword(genPassword()),
          role: "employee",
          position: raw?.position ? String(raw.position) : null,
          salary,
          joiningDate,
          branchId: branchId || null,
          departmentId: departmentId || null,
          shiftId: shiftId || null,
          payMode,
          pan: bulkPan,
          uan: bulkUan,
          ifscCode: bulkIfsc,
          accountNumber: bulkAccount,
          salaryStructure:
            extra.salaryStructure !== undefined && extra.salaryStructure !== null && extra.salaryStructure !== ""
              ? (extra.salaryStructure as Prisma.InputJsonValue)
              : undefined,
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

  return NextResponse.json({ created, failed });
}
