import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { dispatchWebhook } from "@/lib/webhooks";
import { parseJoiningDate, parseOptionalMoney, validateEmployeeReferences, validatePayMode, validateSalaryStructure } from "@/lib/employee-validation";

const select = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  position: true,
  salary: true,
  joiningDate: true,
  bankName: true,
  accountNumber: true,
  ifscCode: true,
  pan: true,
  uan: true,
  payMode: true,
  workBasisRate: true,
  branch: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function nextEmployeeNumber(tenantId: string): Promise<string> {
  const rows = await prisma.employee.findMany({
    where: { tenantId, employeeNumber: { startsWith: "EMP-" } },
    select: { employeeNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const m = /^EMP-(\d+)$/.exec(row.employeeNumber);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId },
    select,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    if (firstName.length < 1 || firstName.length > 80) throw new Error("First name is required and must be under 80 characters.");
    if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("Enter a valid employee email address.");
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new Error("Employee password must be at least 12 characters and include upper-case, lower-case and a number.");
    }

    const exists = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email }, select: { id: true } });
    if (exists) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 409 });

    const [count, tenant] = await Promise.all([
      prisma.employee.count({ where: { tenantId: session.tenantId } }),
      prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { seats: true } }),
    ]);
    const seats = tenant?.seats ?? 0;
    if (count >= seats) {
      return NextResponse.json({ error: `Seat limit reached (${seats} seats on your current plan). Please contact your account manager to upgrade.` }, { status: 403 });
    }

    const refs = await validateEmployeeReferences(session.tenantId, body);
    const salary = parseOptionalMoney(body.salary, "Salary");
    const workBasisRate = parseOptionalMoney(body.workBasisRate, "Work-basis rate");
    const payMode = validatePayMode(body.payMode);
    const salaryStructure = validateSalaryStructure(body.salaryStructure);
    const joiningDate = parseJoiningDate(body.joiningDate);
    const passwordHash = await hashPassword(password);

    let employee: Awaited<ReturnType<typeof prisma.employee.create>> | null = null;
    for (let attempt = 0; attempt < 4 && !employee; attempt++) {
      const employeeNumber = await nextEmployeeNumber(session.tenantId);
      try {
        employee = await prisma.employee.create({
          data: {
            tenantId: session.tenantId,
            employeeNumber,
            firstName,
            lastName,
            email,
            phone: body.phone ? String(body.phone).trim() : null,
            password: passwordHash,
            role: "employee",
            position: body.position ? String(body.position).trim() : null,
            salary,
            joiningDate,
            branchId: refs.branchId,
            departmentId: refs.departmentId,
            shiftId: refs.shiftId,
            bankName: body.bankName ? String(body.bankName).trim() : null,
            accountNumber: body.accountNumber ? String(body.accountNumber).trim() : null,
            ifscCode: body.ifscCode ? String(body.ifscCode).trim().toUpperCase() : null,
            pan: body.pan ? String(body.pan).trim().toUpperCase() : null,
            uan: body.uan ? String(body.uan).trim() : null,
            payMode,
            workBasisRate,
            managerId: refs.managerId,
            salaryStructure: salaryStructure === null ? Prisma.DbNull : salaryStructure,
          },
          select,
        }) as Awaited<ReturnType<typeof prisma.employee.create>>;
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002" || attempt === 3) throw err;
      }
    }
    if (!employee) throw new Error("Could not allocate an employee number. Please retry.");

    await dispatchWebhook(session.tenantId, "employee.created", {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create employee.";
    const status = (err as { code?: string }).code === "P2002" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
