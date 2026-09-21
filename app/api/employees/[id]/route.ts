import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getSession, requireActiveSession } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { profilePictureValue } from "@/lib/profile-picture";
import { employeeHistory } from "@/lib/employee-history";
import { enforceEbioEmployeeAccess } from "@/lib/ebioserver";
import { optionalEmployeeEmail, optionalEmployeePosition, shouldProvisionEmployeeLogin } from "@/lib/employee-input";
import { optionalDateInput } from "@/lib/dates";

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
const LICENSE_TYPES = new Set(["learner", "permanent", "commercial", "international"]);
const LICENSE_CLASSIFICATIONS = new Set(["transport", "non_transport", "no_license"]);
const PHONE_RE = /^\+?[0-9]{10,15}$/;
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

function legacyImportData(value: unknown): Prisma.InputJsonValue | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 200) return "invalid";
  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, raw] of entries) {
    if (!key || key.length > 160 || typeof raw !== "string" || raw.length > 10_000) return "invalid";
    totalLength += key.length + raw.length;
    if (totalLength > 500_000) return "invalid";
    result[key] = raw;
  }
  return result;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { legacyImportData: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ legacyImportData: employee.legacyImportData });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const history = body.history === undefined ? null : employeeHistory(body.history);
  if (history && "error" in history) return NextResponse.json({ error: history.error }, { status: 400 });
  const nextAadhaarNumber = body.aadhaarNumber === undefined ? undefined : (body.aadhaarNumber == null || String(body.aadhaarNumber).trim() === "" ? null : String(body.aadhaarNumber).replace(/[\s-]/g, ""));
  const nextDrivingLicenseNumber = body.drivingLicenseNumber === undefined ? undefined : (body.drivingLicenseNumber == null || String(body.drivingLicenseNumber).trim() === "" ? null : String(body.drivingLicenseNumber).trim().toUpperCase());
  const nextDrivingLicenseType = body.drivingLicenseType === undefined ? undefined : (body.drivingLicenseType == null || String(body.drivingLicenseType).trim() === "" ? null : String(body.drivingLicenseType).trim().toLowerCase());
  const nextDrivingLicenseClassification = body.drivingLicenseClassification === undefined ? undefined : (body.drivingLicenseClassification == null || String(body.drivingLicenseClassification).trim() === "" ? null : String(body.drivingLicenseClassification).trim().toLowerCase());
  const nextDrivingLicenseExpiresAt = body.drivingLicenseExpiresAt === undefined ? undefined : optionalDateInput(body.drivingLicenseExpiresAt);
  if (nextAadhaarNumber && !/^\d{12}$/.test(nextAadhaarNumber)) return NextResponse.json({ error: "Aadhaar Number must be 12 digits." }, { status: 400 });
  if (nextDrivingLicenseNumber && (nextDrivingLicenseNumber.length < 8 || nextDrivingLicenseNumber.length > 30)) return NextResponse.json({ error: "Driving License Number must be 8–30 characters." }, { status: 400 });
  if (nextDrivingLicenseType && !LICENSE_TYPES.has(nextDrivingLicenseType)) return NextResponse.json({ error: "Driving License Type must be learner, permanent, commercial, or international." }, { status: 400 });
  if (nextDrivingLicenseClassification && !LICENSE_CLASSIFICATIONS.has(nextDrivingLicenseClassification)) return NextResponse.json({ error: "Driving licence classification must be transport, non-transport, or no licence." }, { status: 400 });
  if (nextDrivingLicenseExpiresAt === "invalid") return NextResponse.json({ error: "Driving License Expiry must be a valid date." }, { status: 400 });
  const photo = body.profilePicture === undefined ? null : profilePictureValue(body.profilePicture);
  if (photo?.error) return NextResponse.json({ error: photo.error }, { status: 400 });
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.legacyImportData !== undefined && session.role !== "admin") {
    return NextResponse.json({ error: "Only admins can edit imported employee data." }, { status: 403 });
  }

  let ownBranchId: string | null = null;
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId || employee.branchId !== manager.branchId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    ownBranchId = manager.branchId;
    for (const k of [
      "salary",
      "employeeNumber",
      "deviceCode",
      "role",
      "status",
      "branchId",
      "payMode",
      "salaryStructure",
      "workBasisRate",
      "bankName",
      "accountNumber",
      "ifscCode",
      "pan",
      "uan",
    ]) {
      delete (body as Record<string, unknown>)[k];
    }
  }

  let ownLocationId: string | null = null;
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
    ownLocationId = manager.locationId;
    const target = await prisma.employee.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { role: true, branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== ownLocationId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (["admin", "branch_manager", "location_manager"].includes(target.role)) {
      return NextResponse.json({ error: "Location managers cannot edit privileged accounts." }, { status: 403 });
    }
    // Location Managers have the same employee-management scope within their location.
    // Tenant-level account privileges remain admin-only.
    for (const k of [
      "role",
      "loginOnly",
    ]) {
      delete (body as Record<string, unknown>)[k];
    }
  }

  const email = body.email !== undefined ? optionalEmployeeEmail(body.email) : employee.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (email && email !== employee.email) {
    const duplicate = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email, NOT: { id } } });
    if (duplicate) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 400 });
  }
  const password = body.password !== undefined ? String(body.password).trim() : "";
  if (shouldProvisionEmployeeLogin(email, password) && password.length < 12) {
    return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
  }
  const requestedStatus = body.status ?? employee.status;
  if (requestedStatus === "inactive" && employee.status === "active") {    if (session.sub === id) {
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
  // Role changes (admin-only: branch_manager callers have "role" stripped
  // above). The update below previously ignored body.role entirely, so branch
  // manager assignment returned success without ever promoting anyone.
  const VALID_ROLES = ["admin", "supervisor", "employee", "branch_manager"];
  let nextRole = employee.role;
  if (body.role !== undefined) {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Only admins can change roles." }, { status: 403 });
    }
    nextRole = String(body.role);
    if (!VALID_ROLES.includes(nextRole)) {
      return NextResponse.json({ error: "Role must be one of: admin, supervisor, employee, branch_manager." }, { status: 400 });
    }
    if (id === session.sub && nextRole !== employee.role) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }
    if (employee.role === "admin" && nextRole !== "admin") {
      const activeAdmins = await prisma.employee.count({
        where: { tenantId: session.tenantId, role: "admin", status: "active" },
      });
      if (activeAdmins <= 1) {
        return NextResponse.json({ error: "Cannot demote the last active admin." }, { status: 400 });
      }
    }
  }
  const isUnprovisionedDeviceAccount = employee.email?.endsWith("@device.local") ?? false;
  if (requestedStatus === "active" && employee.status !== "active" && isUnprovisionedDeviceAccount && (email?.endsWith("@device.local") || !password)) {
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
  const nextPosition = body.position !== undefined ? optionalEmployeePosition(body.position) : employee.position;
  if (nextPosition && nextPosition.length > 100) {
    return NextResponse.json({ error: "Position must be at most 100 characters." }, { status: 400 });
  }
  const nextEmployeeNumber = body.employeeNumber !== undefined ? String(body.employeeNumber).trim() : employee.employeeNumber;
  const nextDeviceCode = body.deviceCode !== undefined ? String(body.deviceCode).trim() || null : employee.deviceCode;
  if (!nextEmployeeNumber || nextEmployeeNumber.length > 100) return NextResponse.json({ error: "Employee Code must be 1–100 characters." }, { status: 400 });
  if (nextDeviceCode && nextDeviceCode.length > 100) return NextResponse.json({ error: "Device Code must be at most 100 characters." }, { status: 400 });
  if (nextEmployeeNumber !== employee.employeeNumber) {
    const duplicate = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, employeeNumber: nextEmployeeNumber, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "An employee with this Employee Code already exists." }, { status: 409 });
  }
  if (nextDeviceCode && nextDeviceCode !== employee.deviceCode) {
    const duplicate = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, deviceCode: nextDeviceCode, NOT: { id } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "An employee with this Device Code already exists." }, { status: 409 });
  }
  if (nextDeviceCode !== employee.deviceCode && employee.deviceAccessEnabled) {
    return NextResponse.json({ error: "Remove or reapply biometric device access before changing this employee's Device Code." }, { status: 400 });
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
      nextPhone = String(body.phone).replace(/[\s-]/g, "").trim();
      // Validate only on a real change, compared against the normalized stored
      // value, so a legacy short or formatted number never blocks an unrelated
      // edit — it is simply re-saved in normalized form.
      const currentPhone = (employee.phone ?? "").replace(/[\s-]/g, "").trim();
      if (nextPhone !== currentPhone && !PHONE_RE.test(nextPhone)) {
        return NextResponse.json({ error: "Enter a valid phone number (10-15 digits)." }, { status: 400 });
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
  const nextLegacyImportData = body.legacyImportData === undefined ? employee.legacyImportData : legacyImportData(body.legacyImportData);
  if (nextLegacyImportData === "invalid") {
    return NextResponse.json({ error: "Imported employee data must be up to 200 text fields and 500 KB." }, { status: 400 });
  }

  // Cross-tenant FK guard — every linked row must belong to this tenant.
  const wantBranch = body.branchId !== undefined ? (body.branchId || null) : employee.branchId;
  const wantDept = body.departmentId !== undefined ? (body.departmentId || null) : employee.departmentId;
  const wantShift = body.shiftId !== undefined ? (body.shiftId || null) : employee.shiftId;
  const wantManager = body.managerId !== undefined ? (body.managerId || null) : employee.managerId;
  const [branch, department, shift, manager] = await Promise.all([
    wantBranch ? prisma.branch.findFirst({ where: { id: String(wantBranch), tenantId: session.tenantId }, select: { id: true, locationId: true } }) : null,
    wantDept ? prisma.department.findFirst({ where: { id: String(wantDept), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantShift ? prisma.shift.findFirst({ where: { id: String(wantShift), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantManager ? prisma.employee.findFirst({ where: { id: String(wantManager), tenantId: session.tenantId, status: "active" }, select: { id: true, branchId: true, branch: { select: { locationId: true } } } }) : null,
  ]);
  if (wantBranch && !branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
  if (wantDept && !department) return NextResponse.json({ error: "Department not found in this workspace." }, { status: 400 });
  if (wantShift && !shift) return NextResponse.json({ error: "Shift not found in this workspace." }, { status: 400 });
  if (wantManager && !manager) return NextResponse.json({ error: "Manager not found in this workspace." }, { status: 400 });
  if (session.role === "branch_manager" && wantManager && manager && manager.branchId !== ownBranchId) {
    return NextResponse.json({ error: "Manager not found in this workspace." }, { status: 400 });
  }
  if (session.role === "location_manager" && ownLocationId) {
    if (wantBranch && branch?.locationId !== ownLocationId) {
      return NextResponse.json({ error: "Branch must belong to your assigned location." }, { status: 403 });
    }
    if (wantManager && manager?.branch?.locationId !== ownLocationId) {
      return NextResponse.json({ error: "Reporting manager must belong to your assigned location." }, { status: 403 });
    }
  }
  if (wantManager && String(wantManager) === id) {
    return NextResponse.json({ error: "An employee cannot be their own manager." }, { status: 400 });
  }
  // A branch manager must belong to a branch (login also blocks branch-less
  // managers, so allowing it here would strand the account).
  const nextBranchId = body.branchId !== undefined ? (body.branchId || null) : employee.branchId;
  if (nextRole === "branch_manager" && !nextBranchId) {
    return NextResponse.json({ error: "A branch manager must be assigned to a branch." }, { status: 400 });
  }
  if (nextRole === "branch_manager" && (!email || (!employee.password && !password))) {
    return NextResponse.json({ error: "A branch manager requires an email and password." }, { status: 400 });
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
       employeeNumber: nextEmployeeNumber,
       deviceCode: nextDeviceCode,
       firstName: nextFirstName,
      lastName: nextLastName,
      email,
      password: email ? (shouldProvisionEmployeeLogin(email, password) ? await hashPassword(password) : employee.password) : null,
      phone: nextPhone,
      position: nextPosition,
      role: nextRole,
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
       profilePicture: photo ? photo.value : employee.profilePicture,
       aadhaarNumber: nextAadhaarNumber === undefined ? employee.aadhaarNumber : nextAadhaarNumber,
       drivingLicenseNumber: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseNumber === undefined ? employee.drivingLicenseNumber : nextDrivingLicenseNumber,
       drivingLicenseClassification: nextDrivingLicenseClassification === undefined ? employee.drivingLicenseClassification : nextDrivingLicenseClassification,
       drivingLicenseType: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseType === undefined ? employee.drivingLicenseType : nextDrivingLicenseType,
       drivingLicenseExpiresAt: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseExpiresAt === undefined ? employee.drivingLicenseExpiresAt : nextDrivingLicenseExpiresAt,
       legacyImportData: nextLegacyImportData === null ? Prisma.DbNull : nextLegacyImportData,
       ...(history ? {
         education: { deleteMany: {}, create: history.education },
         workExperience: { deleteMany: {}, create: history.experience },
       } : {}),
    },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      if (p2002Targets(err).includes("email")) {
        return NextResponse.json({ error: "An employee with this email already exists." }, { status: 409 });
      }
       return NextResponse.json({ error: "Employee Code or Device Code already exists — please retry." }, { status: 409 });
    }
    throw err;
  }
  const pickAuditFields = (r: typeof employee) => ({
    firstName: r.firstName,
    employeeNumber: r.employeeNumber,
    deviceCode: r.deviceCode,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    position: r.position,
    departmentId: r.departmentId,
    branchId: r.branchId,
    shiftId: r.shiftId,
    status: r.status,
    role: r.role,
    managerId: r.managerId,
    hasLegacyImportData: r.legacyImportData != null,
  });
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "employee.update",
    entity: "Employee",
    entityId: id,
    summary: `${updated.firstName} ${updated.lastName} updated`,
    before: pickAuditFields(employee),
    after: pickAuditFields(updated),
  });
  if (updated.status !== employee.status) {
    const results = await enforceEbioEmployeeAccess(session.tenantId, updated.id, updated.status === "active");
    const failed = results.filter((result) => result.status === "failed");
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: updated.status === "active" ? "employee.device_access.restore" : "employee.device_access.block",
      entity: "Employee",
      entityId: updated.id,
      summary: `${updated.firstName} ${updated.lastName}: ${updated.status === "active" ? "restore" : "block"} sent to ${results.length} active eBio device(s)${failed.length ? `; ${failed.length} failed` : ""}`,
      after: { allowed: updated.status === "active", results },
    });
  }
  return NextResponse.json({ employee: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = session.role === "location_manager" ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { branch: { locationId } } : {}) } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role === "location_manager" && ["admin", "branch_manager", "location_manager"].includes(employee.role)) {
    return NextResponse.json({ error: "Location managers cannot delete privileged accounts." }, { status: 403 });
  }
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
