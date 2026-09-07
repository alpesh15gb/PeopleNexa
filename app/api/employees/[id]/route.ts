import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Walk the manager chain starting at `newManagerId` to ensure assigning it
 * to `employeeId` wouldn't create a cycle (self or descendant). Uses a
 * visited set so a pre-existing loop in the chain can't slip past a depth
 * cutoff or spin forever.
 */
async function wouldCreateManagerCycle(
  employeeId: string,
  newManagerId: string,
  tenantId: string
): Promise<boolean> {
  const visited = new Set<string>();
  let current: string | null = newManagerId;
  while (current) {
    if (current === employeeId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const row: { managerId: string | null } | null = await prisma.employee.findFirst({
      where: { id: current, tenantId },
      select: { managerId: true },
    });
    if (!row?.managerId) return false;
    current = row.managerId;
  }
  return false;
}

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

function p2002Targets(err: unknown): string[] {
  const t = (err as { meta?: { target?: unknown } })?.meta?.target;
  return Array.isArray(t) ? t.map(String) : [];
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
  if (body.status !== undefined && body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
  }
  const requestedStatus = body.status ?? employee.status;
  if (requestedStatus === "inactive" && employee.status === "active") {
    if (session.sub === id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    if (employee.role === "admin") {
      const activeAdmins = await prisma.employee.count({
        where: { tenantId: session.tenantId, role: "admin", status: "active" },
      });
      if (activeAdmins <= 1) {
        return NextResponse.json({ error: "Cannot deactivate the last active admin." }, { status: 400 });
      }
    }
  }
  const isUnprovisionedDeviceAccount = employee.email.endsWith("@device.local");
  if (requestedStatus === "active" && isUnprovisionedDeviceAccount && (email.endsWith("@device.local") || !password)) {
    return NextResponse.json({ error: "Provision a real email and a new password before activating this imported account." }, { status: 400 });
  }

  // Numeric / date guards (reject NaN / Invalid with 400, not 500).
  let nextFirstName = employee.firstName;
  if (body.firstName !== undefined) {
    nextFirstName = body.firstName != null ? String(body.firstName).trim() : "";
    if (!nextFirstName) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }
    if (nextFirstName.length > 100) {
      return NextResponse.json({ error: "First name must be at most 100 characters." }, { status: 400 });
    }
  }
  let nextLastName = employee.lastName;
  if (body.lastName !== undefined && body.lastName !== null) {
    const rawLast = String(body.lastName);
    nextLastName = rawLast.trim();
    if (rawLast !== "" && !nextLastName) {
      return NextResponse.json({ error: "Last name cannot be empty." }, { status: 400 });
    }
    if (nextLastName.length > 100) {
      return NextResponse.json({ error: "Last name must be at most 100 characters." }, { status: 400 });
    }
  }
  if (body.position !== undefined && body.position !== null && body.position !== "" && String(body.position).length > 100) {
    return NextResponse.json({ error: "Position must be at most 100 characters." }, { status: 400 });
  }
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
    const rangeErr = joiningDateRangeError(d);
    if (rangeErr) return NextResponse.json({ error: rangeErr }, { status: 400 });
  }

  let nextPayMode = employee.payMode;
  if (body.payMode !== undefined && body.payMode !== null && String(body.payMode).trim() !== "") {
    nextPayMode = String(body.payMode).trim();
    if (!PAY_MODES.has(nextPayMode)) {
      return NextResponse.json({ error: "Pay mode must be one of monthly, daily, weekly, hourly, work_basis." }, { status: 400 });
    }
  }
  let nextPhone = employee.phone;
  if (body.phone !== undefined) {
    if (body.phone === null || String(body.phone).trim() === "") {
      nextPhone = null;
    } else {
      nextPhone = String(body.phone).trim();
      if (!PHONE_RE.test(nextPhone.replace(/[\s-]/g, ""))) {
        return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
      }
    }
  }
  let nextPan = employee.pan;
  if (body.pan !== undefined) {
    nextPan = body.pan === null || String(body.pan).trim() === "" ? null : String(body.pan).trim().toUpperCase();
    if (nextPan != null && !PAN_RE.test(nextPan)) {
      return NextResponse.json({ error: "Enter a valid PAN (e.g. ABCDE1234F)." }, { status: 400 });
    }
  }
  let nextIfsc = employee.ifscCode;
  if (body.ifscCode !== undefined) {
    nextIfsc = body.ifscCode === null || String(body.ifscCode).trim() === "" ? null : String(body.ifscCode).trim().toUpperCase();
    if (nextIfsc != null && !IFSC_RE.test(nextIfsc)) {
      return NextResponse.json({ error: "Enter a valid IFSC code (e.g. HDFC0001234)." }, { status: 400 });
    }
  }
  let nextUan = employee.uan;
  if (body.uan !== undefined) {
    nextUan = body.uan === null || String(body.uan).trim() === "" ? null : String(body.uan).trim();
    if (nextUan != null && !UAN_RE.test(nextUan)) {
      return NextResponse.json({ error: "UAN must be a 12-digit number." }, { status: 400 });
    }
  }
  let nextAccount = employee.accountNumber;
  if (body.accountNumber !== undefined) {
    nextAccount = body.accountNumber === null || String(body.accountNumber).trim() === "" ? null : String(body.accountNumber).trim();
    if (nextAccount != null && !ACCOUNT_RE.test(nextAccount)) {
      return NextResponse.json({ error: "Account number must be 6–20 digits." }, { status: 400 });
    }
  }
  const ssErr = body.salaryStructure !== undefined ? salaryStructureError(body.salaryStructure) : null;
  if (ssErr) return NextResponse.json({ error: ssErr }, { status: 400 });

  // Cross-tenant FK guard — every linked row must belong to this tenant.
  const wantBranch = body.branchId !== undefined ? (body.branchId || null) : employee.branchId;
  const wantDept = body.departmentId !== undefined ? (body.departmentId || null) : employee.departmentId;
  const wantShift = body.shiftId !== undefined ? (body.shiftId || null) : employee.shiftId;
  const wantManager = body.managerId !== undefined ? (body.managerId || null) : employee.managerId;
  const [branch, department, shift, manager] = await Promise.all([
    wantBranch ? prisma.branch.findFirst({ where: { id: String(wantBranch), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantDept ? prisma.department.findFirst({ where: { id: String(wantDept), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantShift ? prisma.shift.findFirst({ where: { id: String(wantShift), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantManager ? prisma.employee.findFirst({ where: { id: String(wantManager), tenantId: session.tenantId, status: "active" }, select: { id: true } }) : null,
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

  let updated;
  try {
    updated = await prisma.employee.update({
    where: { id },
    data: {
      firstName: nextFirstName,
      lastName: nextLastName,
      email,
      ...(password ? { password: await hashPassword(password) } : {}),
      phone: nextPhone,
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
      accountNumber: nextAccount,
      ifscCode: nextIfsc,
      pan: nextPan,
      uan: nextUan,
      payMode: nextPayMode,
      workBasisRate: body.workBasisRate !== undefined ? (body.workBasisRate != null && body.workBasisRate !== "" ? Number(body.workBasisRate) : null) : employee.workBasisRate,
    },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      if (p2002Targets(err).includes("email")) {
        return NextResponse.json({ error: "An employee with this email already exists." }, { status: 409 });
      }
      return NextResponse.json({ error: "Employee number clash — please retry." }, { status: 409 });
    }
    throw err;
  }
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
  const [payslipCount, loanCount, adjustmentCount, attendanceCount] = await Promise.all([
    prisma.payslip.count({ where: { employeeId: id, tenantId: session.tenantId } }),
    prisma.employeeLoan.count({ where: { employeeId: id, tenantId: session.tenantId } }),
    prisma.payrollAdjustment.count({ where: { employeeId: id, tenantId: session.tenantId } }),
    prisma.attendance.count({ where: { employeeId: id, tenantId: session.tenantId } }),
  ]);
  if (payslipCount + loanCount + adjustmentCount + attendanceCount > 0) {
    return NextResponse.json(
      { error: "This employee has payroll or attendance history and cannot be deleted. Please offboard them via Exits instead." },
      { status: 400 }
    );
  }
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
