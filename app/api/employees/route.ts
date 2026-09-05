import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { dispatchWebhook } from "@/lib/webhooks";

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

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId },
    select,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!body.firstName || !email || !body.password) {
      return NextResponse.json({ error: "First name, email and password are required." }, { status: 400 });
    }
    if (String(body.password).length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const exists = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email } });
    if (exists) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 400 });

    // Numeric / date validation — reject NaN / Invalid Date with 400 instead of 500.
    const salary =
      body.salary != null && body.salary !== ""
        ? Number(body.salary)
        : null;
    if (salary != null && (!Number.isFinite(salary) || salary < 0 || salary > 100_000_000)) {
      return NextResponse.json({ error: "Salary must be a number between 0 and 10,00,00,000." }, { status: 400 });
    }
    const workBasisRate =
      body.workBasisRate != null && body.workBasisRate !== ""
        ? Number(body.workBasisRate)
        : null;
    if (workBasisRate != null && (!Number.isFinite(workBasisRate) || workBasisRate < 0)) {
      return NextResponse.json({ error: "Work-basis rate must be a non-negative number." }, { status: 400 });
    }
    let joiningDate: Date | null = null;
    if (body.joiningDate) {
      const d = new Date(body.joiningDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Joining date is invalid." }, { status: 400 });
      joiningDate = d;
    }

    // Cross-tenant FK guard: branch/department/shift/manager must belong to this tenant.
    const [branch, department, shift, manager] = await Promise.all([
      body.branchId ? prisma.branch.findFirst({ where: { id: String(body.branchId), tenantId: session.tenantId }, select: { id: true } }) : null,
      body.departmentId ? prisma.department.findFirst({ where: { id: String(body.departmentId), tenantId: session.tenantId }, select: { id: true } }) : null,
      body.shiftId ? prisma.shift.findFirst({ where: { id: String(body.shiftId), tenantId: session.tenantId }, select: { id: true } }) : null,
      body.managerId ? prisma.employee.findFirst({ where: { id: String(body.managerId), tenantId: session.tenantId }, select: { id: true } }) : null,
    ]);
    if (body.branchId && !branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
    if (body.departmentId && !department) return NextResponse.json({ error: "Department not found in this workspace." }, { status: 400 });
    if (body.shiftId && !shift) return NextResponse.json({ error: "Shift not found in this workspace." }, { status: 400 });
    if (body.managerId && !manager) return NextResponse.json({ error: "Manager not found in this workspace." }, { status: 400 });

    const [count, tenant] = await Promise.all([
      prisma.employee.count({ where: { tenantId: session.tenantId } }),
      prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { seats: true } }),
    ]);
    const seats = tenant?.seats ?? 0;
    if (count >= seats) {
      return NextResponse.json(
        { error: `Seat limit reached (${seats} seats on your current plan). Please contact your account manager to upgrade.` },
        { status: 403 }
      );
    }
    let employee;
    try {
      employee = await prisma.employee.create({
        data: {
          tenantId: session.tenantId,
          employeeNumber: `EMP-${String(count + 1).padStart(3, "0")}`,
          firstName: body.firstName,
          lastName: body.lastName ?? "",
          email,
          phone: body.phone ?? null,
          password: await hashPassword(String(body.password)),
          role: "employee",
          position: body.position ?? null,
          salary,
          joiningDate,
          branchId: body.branchId || null,
          departmentId: body.departmentId || null,
          shiftId: body.shiftId || null,
          bankName: body.bankName || null,
          accountNumber: body.accountNumber || null,
          ifscCode: body.ifscCode || null,
          pan: body.pan || null,
          uan: body.uan || null,
          payMode: body.payMode || "monthly",
          workBasisRate,
          managerId: body.managerId || null,
          salaryStructure: body.salaryStructure || null,
        },
        select,
      });
    } catch (err: unknown) {
      // Concurrent creates can collide on EMP-NNN or exceed seats — surface 409 so the UI can retry.
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Employee number clash — please retry." }, { status: 409 });
      }
      throw err;
    }
    await dispatchWebhook(session.tenantId, "employee.created", {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create employee." }, { status: 500 });
  }
}
