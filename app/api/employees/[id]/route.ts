import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { parseJoiningDate, parseOptionalMoney, validateEmployeeReferences, validatePayMode, validateSalaryStructure } from "@/lib/employee-validation";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
    if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });

    const refs = await validateEmployeeReferences(session.tenantId, {
      branchId: body.branchId !== undefined ? body.branchId : employee.branchId,
      departmentId: body.departmentId !== undefined ? body.departmentId : employee.departmentId,
      shiftId: body.shiftId !== undefined ? body.shiftId : employee.shiftId,
      managerId: body.managerId !== undefined ? body.managerId : employee.managerId,
    }, id);

    const status = body.status !== undefined ? String(body.status) : employee.status;
    if (!new Set(["active", "inactive"]).has(status)) throw new Error("Invalid employee status.");

    let passwordHash: string | undefined;
    if (body.password !== undefined && String(body.password).length > 0) {
      const password = String(body.password);
      if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
        throw new Error("New password must be at least 12 characters and include upper-case, lower-case and a number.");
      }
      passwordHash = await hashPassword(password);
    }

    const salary = body.salary !== undefined ? parseOptionalMoney(body.salary, "Salary") : employee.salary;
    const workBasisRate = body.workBasisRate !== undefined ? parseOptionalMoney(body.workBasisRate, "Work-basis rate") : employee.workBasisRate;
    const payMode = body.payMode !== undefined ? validatePayMode(body.payMode) : employee.payMode;
    const salaryStructure = body.salaryStructure !== undefined ? validateSalaryStructure(body.salaryStructure) : undefined;
    const joiningDate = body.joiningDate !== undefined ? parseJoiningDate(body.joiningDate) : employee.joiningDate;

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        firstName: body.firstName !== undefined ? String(body.firstName).trim() : employee.firstName,
        lastName: body.lastName !== undefined ? String(body.lastName).trim() : employee.lastName,
        phone: body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : employee.phone,
        position: body.position !== undefined ? (body.position ? String(body.position).trim() : null) : employee.position,
        salary,
        status,
        joiningDate,
        branchId: refs.branchId,
        departmentId: refs.departmentId,
        shiftId: refs.shiftId,
        managerId: refs.managerId,
        ...(body.salaryStructure !== undefined
          ? { salaryStructure: salaryStructure === null ? Prisma.DbNull : salaryStructure }
          : {}),
        bankName: body.bankName !== undefined ? (body.bankName ? String(body.bankName).trim() : null) : employee.bankName,
        accountNumber: body.accountNumber !== undefined ? (body.accountNumber ? String(body.accountNumber).trim() : null) : employee.accountNumber,
        ifscCode: body.ifscCode !== undefined ? (body.ifscCode ? String(body.ifscCode).trim().toUpperCase() : null) : employee.ifscCode,
        pan: body.pan !== undefined ? (body.pan ? String(body.pan).trim().toUpperCase() : null) : employee.pan,
        uan: body.uan !== undefined ? (body.uan ? String(body.uan).trim() : null) : employee.uan,
        payMode,
        workBasisRate,
        ...(passwordHash ? { password: passwordHash } : {}),
      },
    });
    return NextResponse.json({ employee: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update employee.";
    const status = (err as { code?: string }).code === "P2002" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.role === "admin") return NextResponse.json({ error: "Cannot delete an admin account." }, { status: 400 });
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
