import { employeeLocationScope } from "@/lib/location-scope";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireActiveSession } from "@/lib/session";
import { internalEmployeeEmail, passwordError } from "@/lib/ess-login";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { profilePictureValue } from "@/lib/profile-picture";
import { employeeHistory } from "@/lib/employee-history";
import { enforceEbioEmployeeAccess } from "@/lib/ebioserver";
import { optionalEmployeeEmail, optionalEmployeePosition, shouldProvisionEmployeeLogin } from "@/lib/employee-input";
import { optionalDateInput } from "@/lib/dates";
import { reportingManagerCreatesCycle } from "@/lib/employee-reporting-line";

const PAY_MODES = new Set(["monthly", "daily", "weekly", "hourly", "work_basis"]);
const LICENSE_TYPES = new Set(["learner", "permanent", "commercial", "international"]);
const LICENSE_CLASSIFICATIONS = new Set(["transport", "non_transport", "no_license"]);
const PHONE_RE = /^\+?[0-9]{10,15}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UAN_RE = /^\d{12}$/;
const ESI_IP_RE = /^[A-Z0-9-]{6,30}$/i;
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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Enter a valid employee update." }, { status: 400 });
  const history = body.history === undefined ? null : employeeHistory(body.history);
  if (history && "error" in history) return NextResponse.json({ error: history.error }, { status: 400 });
  const nextAadhaarNumber = body.aadhaarNumber === undefined ? undefined : (body.aadhaarNumber == null || String(body.aadhaarNumber).trim() === "" ? null : String(body.aadhaarNumber).replace(/[\s-]/g, ""));
  const nextDrivingLicenseNumber = body.drivingLicenseNumber === undefined ? undefined : (body.drivingLicenseNumber == null || String(body.drivingLicenseNumber).trim() === "" ? null : String(body.drivingLicenseNumber).trim().toUpperCase());
  const nextDrivingLicenseType = body.drivingLicenseType === undefined ? undefined : (body.drivingLicenseType == null || String(body.drivingLicenseType).trim() === "" ? null : String(body.drivingLicenseType).trim().toLowerCase());
  const nextDrivingLicenseClassification = body.drivingLicenseClassification === undefined ? undefined : (body.drivingLicenseClassification == null || String(body.drivingLicenseClassification).trim() === "" ? null : String(body.drivingLicenseClassification).trim().toLowerCase());
  const nextDrivingLicenseExpiresAt = body.drivingLicenseExpiresAt === undefined ? undefined : optionalDateInput(body.drivingLicenseExpiresAt);
  const nextDrivingLicenseIssuedAt = body.drivingLicenseIssuedAt === undefined ? undefined : optionalDateInput(body.drivingLicenseIssuedAt);
  const nextIdCardIssuedAt = body.idCardIssuedAt === undefined ? undefined : optionalDateInput(body.idCardIssuedAt);
  const nextIdCardValidUntil = body.idCardValidUntil === undefined ? undefined : optionalDateInput(body.idCardValidUntil);
  if (nextAadhaarNumber && !/^\d{12}$/.test(nextAadhaarNumber)) return NextResponse.json({ error: "Aadhaar Number must be 12 digits." }, { status: 400 });
  if (nextDrivingLicenseNumber && (nextDrivingLicenseNumber.length < 8 || nextDrivingLicenseNumber.length > 30)) return NextResponse.json({ error: "Driving License Number must be 8–30 characters." }, { status: 400 });
  if (nextDrivingLicenseType && !LICENSE_TYPES.has(nextDrivingLicenseType)) return NextResponse.json({ error: "Driving License Type must be learner, permanent, commercial, or international." }, { status: 400 });
  if (nextDrivingLicenseClassification && !LICENSE_CLASSIFICATIONS.has(nextDrivingLicenseClassification)) return NextResponse.json({ error: "Driving licence classification must be transport, non-transport, or no licence." }, { status: 400 });
  if (nextDrivingLicenseExpiresAt === "invalid") return NextResponse.json({ error: "Driving License Expiry must be a valid date." }, { status: 400 });
  if (nextDrivingLicenseIssuedAt === "invalid") return NextResponse.json({ error: "Driving License Issue Date must be a valid date." }, { status: 400 });
  if (nextIdCardIssuedAt === "invalid" || nextIdCardValidUntil === "invalid") return NextResponse.json({ error: "ID card issue date and validity must be valid dates." }, { status: 400 });
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
    if (employee.loginOnly || ["admin", "branch_manager", "location_manager"].includes(employee.role)) {
      return NextResponse.json({ error: "Only workspace administrators can edit manager accounts." }, { status: 403 });
    }
    if (body.password !== undefined) return NextResponse.json({ error: "Only workspace or location administrators can reset employee credentials." }, { status: 403 });
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
       "esiIpNumber",
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
      where: { id, tenantId: session.tenantId, ...employeeLocationScope(ownLocationId) },
      select: { role: true, branch: { select: { locationId: true } } },
    });
    if (!target) {
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

  const selectedEmail = body.email !== undefined ? optionalEmployeeEmail(body.email) : employee.email;
  // Historical device imports used synthetic emails and opaque passwords.
  // They are not employee portal credentials and must not be required to edit.
  let email = selectedEmail?.endsWith("@device.local") ? null : selectedEmail;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (email && email !== employee.email) {
    const duplicate = await prisma.employee.findFirst({ where: { tenantId: session.tenantId, email, NOT: { id } } });
    if (duplicate) return NextResponse.json({ error: "An employee with this email already exists." }, { status: 400 });
  }
  const password = body.password !== undefined ? String(body.password).trim() : "";
  if (!email && (password || (employee.password && !employee.email?.endsWith("@device.local"))) && (body.role ?? employee.role) === "employee") email = internalEmployeeEmail(session.tenantId, employee.id);
  if (shouldProvisionEmployeeLogin(email, password) && passwordError(password)) {
    return NextResponse.json({ error: passwordError(password) }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ error: "Status must be active or inactive." }, { status: 400 });
  }
  const requestedStatus = body.status ?? employee.status;
  if (requestedStatus === "inactive" && employee.status === "active") {    if (session.sub === id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
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
  if (body.position !== undefined && nextPosition && nextPosition !== employee.position && !(await prisma.designation.findFirst({ where: { tenantId: session.tenantId, name: nextPosition, active: true }, select: { id: true } }))) return NextResponse.json({ error: "Select an active designation." }, { status: 400 });
  if (nextPosition && nextPosition.length > 100) {
    return NextResponse.json({ error: "Position must be at most 100 characters." }, { status: 400 });
  }
  const nextEmployeeNumber = body.employeeNumber !== undefined ? String(body.employeeNumber ?? "").trim() : employee.employeeNumber;
  const nextDeviceCode = body.deviceCode !== undefined ? String(body.deviceCode ?? "").trim() || null : employee.deviceCode;
  if (!nextEmployeeNumber || nextEmployeeNumber.length > 100) return NextResponse.json({ error: "Employee Code must be 1–100 characters." }, { status: 400 });
  if (nextDeviceCode && nextDeviceCode.length > 100) return NextResponse.json({ error: "Device Code must be at most 100 characters." }, { status: 400 });
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
  const joiningDate = body.joiningDate === undefined ? employee.joiningDate : optionalDateInput(body.joiningDate);
  if (joiningDate === "invalid") return NextResponse.json({ error: "Joining date is invalid." }, { status: 400 });
  if (body.joiningDate !== undefined && joiningDate) {
    const rangeErr = joiningDateRangeError(joiningDate);
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
      // Validate only on a real change, so a legacy short or formatted number
      // never blocks an unrelated edit. The submitted value is stored as typed
      // — existing rows are never rewritten by a save that didn't touch them.
      const currentPhone = (employee.phone ?? "").trim();
      if (nextPhone !== currentPhone && !PHONE_RE.test(nextPhone.replace(/[\s-]/g, ""))) {
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
  let nextEsiIpNumber = employee.esiIpNumber;
  if (body.esiIpNumber !== undefined) {
    nextEsiIpNumber = body.esiIpNumber === null || String(body.esiIpNumber).trim() === "" ? null : String(body.esiIpNumber).trim().toUpperCase();
    if (nextEsiIpNumber != null && !ESI_IP_RE.test(nextEsiIpNumber)) return NextResponse.json({ error: "ESI/IP number must be 6-30 letters, numbers, or hyphens." }, { status: 400 });
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
  const [branch, department, shift] = await Promise.all([
    wantBranch ? prisma.branch.findFirst({ where: { id: String(wantBranch), tenantId: session.tenantId }, select: { id: true, locationId: true } }) : null,
    wantDept ? prisma.department.findFirst({ where: { id: String(wantDept), tenantId: session.tenantId }, select: { id: true } }) : null,
    wantShift ? prisma.shift.findFirst({ where: { id: String(wantShift), tenantId: session.tenantId }, select: { id: true } }) : null,
  ]);
  if (wantBranch && !branch) return NextResponse.json({ error: "Branch not found in this workspace." }, { status: 400 });
  if (wantDept && !department) return NextResponse.json({ error: "Department not found in this workspace." }, { status: 400 });
  if (wantShift && !shift) return NextResponse.json({ error: "Shift not found in this workspace." }, { status: 400 });
  const changingManager = wantManager !== employee.managerId;
  if (session.role === "location_manager" && ownLocationId) {
    if (wantBranch && branch?.locationId !== ownLocationId) {
      return NextResponse.json({ error: "Branch must belong to your assigned location." }, { status: 403 });
    }
    if (body.branchId !== undefined && employee.branchId && !wantBranch) return NextResponse.json({ error: "Select a branch in your assigned location." }, { status: 403 });
  }
  if (changingManager && wantManager === id) {
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
  const resetsCredential = shouldProvisionEmployeeLogin(email, password);
  if (body.expectedUpdatedAt !== undefined) {
    const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
    if (!expected || Number.isNaN(expected.getTime())) return NextResponse.json({ error: "Employee record revision is invalid." }, { status: 400 });
    if (expected.getTime() !== employee.updatedAt.getTime()) return NextResponse.json({ error: "Employee details changed. Reopen the editor before saving." }, { status: 409 });
  }
  const nextHash = resetsCredential ? await hashPassword(password) : employee.password;
  let updated;
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (changingManager && wantManager) {
        const manager = await tx.employee.findFirst({ where: {
          id: String(wantManager), tenantId: session.tenantId, status: "active", loginOnly: false,
          ...(ownLocationId ? employeeLocationScope(ownLocationId) : {}), ...(ownBranchId ? { branchId: ownBranchId } : {}),
        }, select: { id: true } });
        if (!manager) return { error: "Select an active reporting manager in your scope.", status: 400 } as const;
        if (await reportingManagerCreatesCycle(tx, session.tenantId, id, manager.id)) return { error: "This manager assignment would create a reporting cycle.", status: 400 } as const;
      }
      if (nextEmployeeNumber !== employee.employeeNumber && await tx.employee.findFirst({
        where: { tenantId: session.tenantId, id: { not: id }, employeeNumber: { equals: nextEmployeeNumber, mode: "insensitive" } }, select: { id: true },
      })) return { error: "An employee with this Employee Code already exists.", status: 409 } as const;
      if (employee.role === "admin" && employee.status === "active" && (nextRole !== "admin" || requestedStatus === "inactive")) {
        const otherAdmins = await tx.employee.count({ where: { tenantId: session.tenantId, id: { not: id }, role: "admin", status: "active" } });
        if (otherAdmins === 0) return { error: "Keep at least one active workspace administrator.", status: 400 } as const;
      }
      const updatedEmployee = await tx.employee.update({
    where: { id, tenantId: session.tenantId, updatedAt: employee.updatedAt, ...(ownLocationId ? employeeLocationScope(ownLocationId) : {}), ...(ownBranchId ? { branchId: ownBranchId } : {}) },
    data: {
       employeeNumber: nextEmployeeNumber,
       deviceCode: nextDeviceCode,
       firstName: nextFirstName,
      lastName: nextLastName,
      email,
      ...(resetsCredential ? { mustChangePassword: true } : {}),
      ...(resetsCredential || requestedStatus !== employee.status || nextRole !== employee.role ? { sessionVersion: { increment: 1 } } : {}),
      password: email ? nextHash : null,
      phone: nextPhone,
      position: nextPosition,
      role: nextRole,
      salary: body.salary === undefined ? employee.salary : body.salary == null || body.salary === "" ? null : Number(body.salary),
      status: requestedStatus,
      joiningDate,
      branchId: body.branchId !== undefined ? (body.branchId || null) : employee.branchId,
      ...(body.branchId !== undefined && wantBranch !== employee.branchId && !employee.loginOnly && employee.role !== "location_manager" ? { locationId: branch?.locationId ?? null } : {}),
      departmentId: body.departmentId !== undefined ? (body.departmentId || null) : employee.departmentId,
      shiftId: body.shiftId !== undefined ? (body.shiftId || null) : employee.shiftId,
      managerId: body.managerId !== undefined ? body.managerId || null : employee.managerId,
      salaryStructure: body.salaryStructure !== undefined ? body.salaryStructure || null : employee.salaryStructure,
      bankName: body.bankName === undefined ? employee.bankName : String(body.bankName ?? "").trim() || null,
      accountNumber: nextAccount,
      ifscCode: nextIfsc,
      pan: nextPan,
       uan: nextUan,
       esiIpNumber: nextEsiIpNumber,
      payMode: nextPayMode,
       workBasisRate: body.workBasisRate !== undefined ? (body.workBasisRate != null && body.workBasisRate !== "" ? Number(body.workBasisRate) : null) : employee.workBasisRate,
       profilePicture: photo ? photo.value : employee.profilePicture,
       aadhaarNumber: nextAadhaarNumber === undefined ? employee.aadhaarNumber : nextAadhaarNumber,
       drivingLicenseNumber: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseNumber === undefined ? employee.drivingLicenseNumber : nextDrivingLicenseNumber,
       drivingLicenseClassification: nextDrivingLicenseClassification === undefined ? employee.drivingLicenseClassification : nextDrivingLicenseClassification,
        drivingLicenseType: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseType === undefined ? employee.drivingLicenseType : nextDrivingLicenseType,
        drivingLicenseIssuedAt: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseIssuedAt === undefined ? employee.drivingLicenseIssuedAt : nextDrivingLicenseIssuedAt,
        drivingLicenseExpiresAt: nextDrivingLicenseClassification === "no_license" ? null : nextDrivingLicenseExpiresAt === undefined ? employee.drivingLicenseExpiresAt : nextDrivingLicenseExpiresAt,
        idCardIssuedAt: nextIdCardIssuedAt === undefined ? employee.idCardIssuedAt : nextIdCardIssuedAt,
        idCardValidUntil: nextIdCardValidUntil === undefined ? employee.idCardValidUntil : nextIdCardValidUntil,
       legacyImportData: employee.email?.endsWith("@device.local") && !employee.branchId
         ? { ...(nextLegacyImportData && typeof nextLegacyImportData === "object" && !Array.isArray(nextLegacyImportData) ? nextLegacyImportData : {}), source: "ebioserver", assignmentPending: true }
         : nextLegacyImportData === null ? Prisma.DbNull : nextLegacyImportData,
       ...(history ? {
         education: { deleteMany: {}, create: history.education },
         workExperience: { deleteMany: {}, create: history.experience },
       } : {}),
    },
      });
      return { employee: updatedEmployee } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    updated = result.employee;
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      if (p2002Targets(err).includes("email")) {
        return NextResponse.json({ error: "An employee with this email already exists." }, { status: 409 });
      }
       return NextResponse.json({ error: "Employee Code or Device Code already exists — please retry." }, { status: 409 });
    }
    if (["P2025", "P2034"].includes((err as { code?: string })?.code ?? "")) return NextResponse.json({ error: "Employee details changed. Refresh and retry." }, { status: 409 });
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
  let deviceWarning: string | null = null;
  if (updated.status !== employee.status && updated.status === "inactive") {
    // Reactivation restores employment only. Existing device policy remains
    // explicit so status changes never broaden biometric access.
    const results = await enforceEbioEmployeeAccess(session.tenantId, updated.id, false).catch(() => null);
    const failed = results?.filter((result) => result.status === "failed") ?? [];
    if (!results || failed.length) deviceWarning = "Review failed or pending biometric blocks in Device access.";
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: "employee.device_access.block",
      entity: "Employee",
      entityId: updated.id,
      summary: results ? `Submitted ${results.length} device blocks` : "Could not submit device blocks",
      after: { allowed: false, results },
    });
  }
  const { password: _password, sessionVersion: _sessionVersion, legacyImportData: _legacyImportData, ...publicEmployee } = updated;
  return NextResponse.json({ employee: session.role === "branch_manager" ? { id, updatedAt: updated.updatedAt, ...pickAuditFields(updated) } : publicEmployee, deviceWarning }, { status: deviceWarning ? 207 : 200 });
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
  const employee = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? employeeLocationScope(locationId) : {}) } });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role === "location_manager" && ["admin", "branch_manager", "location_manager"].includes(employee.role)) {
    return NextResponse.json({ error: "Location managers cannot delete privileged accounts." }, { status: 403 });
  }
  if (employee.role === "admin") {
    return NextResponse.json({ error: "Cannot delete an admin account." }, { status: 400 });
  }
  const removed = await prisma.employee.deleteMany({ where: {
    id, tenantId: session.tenantId, updatedAt: employee.updatedAt,
    ...(locationId ? employeeLocationScope(locationId) : {}),
    payslips: { none: {} }, loans: { none: {} }, payrollAdjustments: { none: {} }, attendance: { none: {} },
    punches: { none: {} }, corrections: { none: {} }, leaveRequests: { none: {} },
    expenseClaims: { none: {} }, assetAssignments: { none: {} }, documents: { none: {} },
    onboardingTasks: { none: {} }, exitRequests: { none: {} }, transfers: { none: {} }, reviews: { none: {} },
    ticketsRequested: { none: {} }, ticketMessages: { none: {} }, team: { none: {} },
  } });
  if (!removed.count) return NextResponse.json({ error: "This employee has linked records or the record changed. Refresh and use the exit workflow to retain employee history." }, { status: 409 });
  return NextResponse.json({ success: true });
}
