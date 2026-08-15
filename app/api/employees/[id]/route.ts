import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
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

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      firstName: body.firstName ?? employee.firstName,
      lastName: body.lastName ?? employee.lastName,
      phone: body.phone ?? employee.phone,
      position: body.position ?? employee.position,
      salary: body.salary != null && body.salary !== "" ? Number(body.salary) : body.salary === "" ? null : employee.salary,
      status: body.status ?? employee.status,
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : employee.joiningDate,
      branchId: body.branchId || null,
      departmentId: body.departmentId || null,
      shiftId: body.shiftId || null,
      bankName: body.bankName ?? employee.bankName,
      accountNumber: body.accountNumber ?? employee.accountNumber,
      ifscCode: body.ifscCode ?? employee.ifscCode,
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
