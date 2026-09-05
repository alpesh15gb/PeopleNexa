import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Walk the manager chain starting at `newManagerId` (max 10 depth) to ensure
 * assigning it to `employeeId` wouldn't create a cycle (self or descendant).
 */
async function wouldCreateManagerCycle(
  employeeId: string,
  newManagerId: string,
  tenantId: string,
  maxDepth = 10
): Promise<boolean> {
  let current: string | null = newManagerId;
  for (let i = 0; i < maxDepth; i++) {
    if (!current) return false;
    if (current === employeeId) return true;
    const row: { managerId: string | null } | null = await prisma.employee.findFirst({
      where: { id: current, tenantId },
      select: { managerId: true },
    });
    if (!row?.managerId) return false;
    current = row.managerId;
  }
  return false;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
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

  // Numeric / date guards (reject NaN / Invalid with 400, not 500).
  if (body.salary != null && body.salary !== "") {
    const n = Number(body.salary);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      return NextResponse.json({ error: "Salary must be a number between 0 and 10,00,00,000." }, { status: 400 });
    }
  }
  if (body.workBasisRate != null && body.workBasisRate !== "") {
    const n = Number(body.workBasisRate);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Work-basis rate must be a non-negative number." }, { status: 400 });
    }
  }
  if (body.joiningDate) {
    const d = new Date(body.joiningDate);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Joining date is invalid." }, { status: 400 });
  }

  // Cross-tenant FK guard — every linked row must belong to this tenant.
  const wantBranch = body.branchId !== undefined ? (body.branchId || null) : employee.branchId;
  const wantDept = body.departmentId !== undefined ? (body.departmentId || null) : employee.departmentId;
  const wantShift = body.shiftId !== undefined ? (body.shiftId || null) : employee.shiftId;
  const wantManager = body.managerId !== undefined ? (body.managerId || null) : employee.managerId;
  const [branch, department, shift, manager] = await Promise.all([
    wantBranch ? prisma.branch.findFirst({ where: { id: String(wantBranch), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantDept ? prisma.department.findFirst({ where: { id: String(wantDept), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantShift ? prisma.shift.findFirst({ where: { id: String(wantShift), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantManager ? prisma.employee.findFirst({ where: { id: String(wantManager), tenantId: session.tenantId }, select: { id: true } }) : null,
  ]);
  if (wantBranch && !branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
  if (wantDept && !department) return NextResponse.json({ error: "Department not found in this workspace." }, { status: 400 });
  if (wantShift && !shift) return NextResponse.json({ error: "Shift not found in this workspace." }, { status: 400 });
  if (wantManager && !manager) return NextResponse.json({ error: "Manager not found in this workspace." }, { status: 400 });
  if (wantManager && String(wantManager) === id) {
    return NextResponse.json({ error: "An employee cannot be their own manager." }, { status: 400 });
  }
  if (wantManager) {
    const cycle = await wouldCreateManagerCycle(id, String(wantManager), session.tenantId);
    if (cycle) {
      return NextResponse.json({ error: "This manager assignment would create a reporting cycle." }, { status: 400 });
    }
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
      branchId: body.branchId !== undefined ? (body.branchId || null) : employee.branchId,
      departmentId: body.departmentId !== undefined ? (body.departmentId || null) : employee.departmentId,
      shiftId: body.shiftId !== undefined ? (body.shiftId || null) : employee.shiftId,
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
  const session = await requireActiveSession().catch(() => null);
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
