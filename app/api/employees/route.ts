import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
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
  const session = await getSession();
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
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!body.firstName || !email || !body.password) {
      return NextResponse.json({ error: "First name, email and password are required." }, { status: 400 });
    }
    const exists = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email } });
    if (exists) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 400 });

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
    const employee = await prisma.employee.create({
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
        salary: body.salary != null && body.salary !== "" ? Number(body.salary) : null,
        joiningDate: body.joiningDate ? new Date(body.joiningDate) : null,
        branchId: body.branchId || null,
        departmentId: body.departmentId || null,
        shiftId: body.shiftId || null,
        bankName: body.bankName || null,
        accountNumber: body.accountNumber || null,
        ifscCode: body.ifscCode || null,
        pan: body.pan || null,
        uan: body.uan || null,
        payMode: body.payMode || "monthly",
        workBasisRate: body.workBasisRate != null && body.workBasisRate !== "" ? Number(body.workBasisRate) : null,
        managerId: body.managerId || null,
        salaryStructure: body.salaryStructure || null,
      },
      select,
    });
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
