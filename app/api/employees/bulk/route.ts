import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 500;
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
        joiningDate = d;
      }

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

      await prisma.employee.create({
        data: {
          tenantId: session.tenantId,
          employeeNumber: `EMP-${String(count + i + 1).padStart(3, "0")}`,
          firstName,
          lastName: String(raw?.lastName ?? ""),
          email,
          phone: raw?.phone ? String(raw.phone) : null,
          password: await hashPassword(genPassword()),
          role: "employee",
          position: raw?.position ? String(raw.position) : null,
          salary,
          joiningDate,
          branchId: branchId || null,
          departmentId: departmentId || null,
          shiftId: shiftId || null,
          payMode,
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
        failed.push({ email: email || `(row ${i + 1})`, error: "Duplicate entry — please retry." });
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
