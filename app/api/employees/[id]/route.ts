import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

  const email = body.email !== undefined ? String(body.email).toLowerCase().trim() : employee.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (email !== employee.email) {
    const duplicate = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email, NOT: { id } } });
    if (duplicate) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 400 });
  }
  const password = body.password !== undefined ? String(body.password).trim() : "";
  if (password && password.length < 12) {
    return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
  }
  const requestedStatus = body.status ?? employee.status;
  const isUnprovisionedDeviceAccount = employee.email.endsWith("@device.local");
  if (requestedStatus === "active" && isUnprovisionedDeviceAccount && (email.endsWith("@device.local") || !password)) {
    return NextResponse.json({ error: "Provision a real email and a new password before activating this imported account." }, { status: 400 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      firstName: body.firstName ?? employee.firstName,
      lastName: body.lastName ?? employee.lastName,
      email,
      ...(password ? { password: await hashPassword(password) } : {}),
      phone: body.phone ?? employee.phone,
      position: body.position ?? employee.position,
      salary: body.salary != null && body.salary !== "" ? Number(body.salary) : body.salary === "" ? null : employee.salary,
      status: requestedStatus,
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : employee.joiningDate,
      branchId: body.branchId || null,
      departmentId: body.departmentId || null,
      shiftId: body.shiftId || null,
      managerId: body.managerId !== undefined ? body.managerId || null : employee.managerId,
      salaryStructure: body.salaryStructure !== undefined ? body.salaryStructure || null : employee.salaryStructure,
      bankName: body.bankName ?? employee.bankName,
      accountNumber: body.accountNumber ?? employee.accountNumber,
      ifscCode: body.ifscCode ?? employee.ifscCode,
      pan: body.pan ?? employee.pan,
      uan: body.uan ?? employee.uan,
      payMode: body.payMode ?? employee.payMode,
      workBasisRate: body.workBasisRate !== undefined ? (body.workBasisRate != null && body.workBasisRate !== "" ? Number(body.workBasisRate) : null) : employee.workBasisRate,
    },
  });
  return NextResponse.json({ employee: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.role === "admin") {
    return NextResponse.json({ error: "Cannot delete an admin account." }, { status: 400 });
  }
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
