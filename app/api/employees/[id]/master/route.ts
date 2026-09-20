import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function text(value: unknown, field: string, required = false): string | null | { error: string } {
  if (value == null || value === "") return required ? { error: `${field} is required.` } : null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2_000) return { error: `${field} must be text up to 2000 characters.` };
  return value.trim();
}

function date(value: unknown, field: string, required = false): Date | null | { error: string } {
  if (value == null || value === "") return required ? { error: `${field} is required.` } : null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: `${field} must be a valid date.` };
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) return { error: `${field} must be a valid date.` };
  return result;
}

function number(value: unknown, field: string, min = 0, max = 100_000_000): number | null | { error: string } {
  if (value == null || value === "") return null;
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : { error: `${field} must be a number between ${min} and ${max}.` };
}

function fail(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function object(value: unknown, field: string): Record<string, unknown> | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `${field} must be an object.` };
  return value as Record<string, unknown>;
}

function optionalTextFields(raw: Record<string, unknown>, fields: string[]): Record<string, string | null> | { error: string } {
  const result: Record<string, string | null> = {};
  for (const field of fields) {
    const value = text(raw[field], field);
    if (fail(value)) return value;
    result[field] = value;
  }
  return result;
}

function safeProfile(profile: Record<string, unknown>) {
  const { nameAsOnAadhaar: _nameAsOnAadhaar, dateOfBirthCertificate: _dateOfBirthCertificate, actualDateOfBirth: _actualDateOfBirth, whatsappNumber: _whatsappNumber, otherMobile: _otherMobile, personalEmail: _personalEmail, fatherName: _fatherName, motherName: _motherName, emergencyContactName: _emergencyContactName, emergencyContactNumber: _emergencyContactNumber, emergencyContactRelation: _emergencyContactRelation, currentAddress: _currentAddress, permanentAddress: _permanentAddress, ...safe } = profile;
  return safe;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager" && session.role !== "branch_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  const branchId = session.role === "branch_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true } }))?.branchId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  if (session.role === "branch_manager" && !branchId) return NextResponse.json({ error: "no branch assigned" }, { status: 403 });

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: session.tenantId, ...(locationId ? { branch: { locationId } } : {}), ...(branchId ? { branchId } : {}) },
    include: {
      profile: true,
      employmentProfile: true,
      dependents: true,
      references: true,
      bankAccounts: true,
      education: true,
      workExperience: true,
      documents: true,
    },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role === "admin" || session.role === "location_manager" || session.role === "branch_manager") return NextResponse.json({ employee });

  const { salary: _salary, bankName: _bankName, accountNumber: _accountNumber, ifscCode: _ifscCode, pan: _pan, uan: _uan, aadhaarNumber: _aadhaarNumber, drivingLicenseNumber: _drivingLicenseNumber, drivingLicenseExpiresAt: _drivingLicenseExpiresAt, salaryStructure: _salaryStructure, workBasisRate: _workBasisRate, legacyImportData: _legacyImportData, deviceCode: _deviceCode, profile, employmentProfile: _employmentProfile, dependents: _dependents, references: _references, bankAccounts: _bankAccounts, documents, workExperience, ...safeEmployee } = employee;
  return NextResponse.json({
    employee: {
      ...safeEmployee,
      profile: profile ? safeProfile(profile) : null,
      education: employee.education,
      workExperience: workExperience.map(({ companyMobile: _companyMobile, companyEmail: _companyEmail, companyAddress: _companyAddress, reportingName: _reportingName, reportingMobile: _reportingMobile, reportingEmail: _reportingEmail, ...experience }) => experience),
      documents: documents.map(({ number: _number, fileUrl: _fileUrl, notes: _notes, ...document }) => document),
    },
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager" && session.role !== "branch_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const { id } = await ctx.params;
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  const branchId = session.role === "branch_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true } }))?.branchId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  if (session.role === "branch_manager" && !branchId) return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
  const exists = await prisma.employee.findFirst({ where: { id, tenantId: session.tenantId, ...(locationId ? { branch: { locationId } } : {}), ...(branchId ? { branchId } : {}) }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const collections = ["dependents", "references", "bankAccounts", "education", "workExperience", "documents"] as const;
  for (const field of collections) if (body[field] !== undefined && !Array.isArray(body[field])) return NextResponse.json({ error: `${field} must be an array.` }, { status: 400 });
  for (const field of ["profile", "employment"] as const) if (body[field] !== undefined && body[field] !== null && fail(object(body[field], field))) return NextResponse.json({ error: `${field} must be an object.` }, { status: 400 });

  const parseRows = <T>(field: string, parser: (row: Record<string, unknown>) => T | { error: string }): T[] | { error: string } => {
    if (body[field] === undefined) return [];
    const rows: T[] = [];
    for (const raw of body[field] as unknown[]) {
      const row = object(raw, field);
      if (fail(row)) return row;
      const parsed = parser(row);
      if (fail(parsed)) return parsed;
      rows.push(parsed);
    }
    return rows;
  };
  const parseProfile = (raw: Record<string, unknown>) => {
    const values = optionalTextFields(raw, ["middleName", "nameAsOnAadhaar", "nickName", "gender", "celebrateDatePreference", "maritalStatus", "spouseName", "bloodGroup", "whatsappNumber", "otherMobile", "personalEmail", "placeOfBirth", "nationality", "citizenship", "fatherName", "motherName", "emergencyContactName", "emergencyContactNumber", "emergencyContactRelation"]);
    if (fail(values)) return values;
    for (const field of ["dateOfBirthCertificate", "actualDateOfBirth", "marriageDate"]) { const value = date(raw[field], field); if (fail(value)) return value; values[field] = value as never; }
    for (const field of ["currentAddress", "permanentAddress"]) {
      const value = raw[field];
      if (value != null && (typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 10_000)) return { error: `${field === "currentAddress" ? "Current" : "Permanent"} address must contain address fields.` };
      values[field] = (value ?? null) as never;
    }
    return values;
  };
  const parseEmployment = (raw: Record<string, unknown>) => {
    const values = optionalTextFields(raw, ["employmentMode", "natureOfEmployment", "probationPeriod", "totalExperience", "salaryGroup", "salaryPaymentMode", "paySalaryFrom", "ptLocation", "subDepartment", "grade", "vehicleCategory", "vehicleClass", "vehicleSubClass", "extensionNumber", "secondManagerCode", "hrManagerCode"]);
    if (fail(values)) return values;
    for (const field of ["rejoiningDate", "statusUpdatedAt"]) { const value = date(raw[field], field); if (fail(value)) return value; values[field] = value as never; }
    const ctc = number(raw.ctc, "ctc"); if (fail(ctc)) return ctc; values.ctc = ctc as never;
    for (const field of ["tdsAllowed", "pfAllowed", "esicAllowed", "autoCreditLeave", "licenseRequired"]) { if (raw[field] != null && typeof raw[field] !== "boolean") return { error: `${field} must be true or false.` }; values[field] = (raw[field] ?? null) as never; }
    return values;
  };
  const dependents = parseRows("dependents", (raw) => {
    const firstName = text(raw.firstName, "dependent firstName", true); if (fail(firstName)) return firstName;
    const values = optionalTextFields(raw, ["middleName", "lastName", "relation", "aadhaarNumber", "mobile", "email", "occupation", "address"]); if (fail(values)) return values;
    const dateOfBirth = date(raw.dateOfBirth, "dependent dateOfBirth"); if (fail(dateOfBirth)) return dateOfBirth;
    const nomineeShare = number(raw.nomineeShare, "nomineeShare", 0, 100); if (fail(nomineeShare)) return nomineeShare;
    return { firstName, ...values, dateOfBirth, nomineeShare };
  });
  const references = parseRows("references", (raw) => { const name = text(raw.name, "reference name", true); if (fail(name)) return name; const values = optionalTextFields(raw, ["relation", "mobile", "email", "occupation", "address"]); return fail(values) ? values : { name, ...values }; });
  const bankAccounts = parseRows("bankAccounts", (raw) => {
    const accountNumber = text(raw.accountNumber, "accountNumber", true); if (fail(accountNumber) || typeof accountNumber !== "string" || !ACCOUNT_RE.test(accountNumber)) return { error: "accountNumber must be 6-20 digits." };
    const values = optionalTextFields(raw, ["ifscCode", "accountHolder", "accountType", "bankName", "bankBranch", "status"]); if (fail(values)) return values;
    if (values.ifscCode && !IFSC_RE.test(values.ifscCode.toUpperCase())) return { error: "ifscCode is invalid." };
    if (raw.isPrimary != null && typeof raw.isPrimary !== "boolean") return { error: "isPrimary must be true or false." };
    return { accountNumber, ...values, ifscCode: values.ifscCode?.toUpperCase() ?? null, isPrimary: raw.isPrimary === true };
  });
  const education = parseRows("education", (raw) => { const qualification = text(raw.qualification, "qualification", true); const institution = text(raw.institution, "institution", true); if (fail(qualification)) return qualification; if (fail(institution)) return institution; const values = optionalTextFields(raw, ["specialization", "board", "grade", "courseType", "educationMode"]); if (fail(values)) return values; const completionYear = raw.completionYear == null || raw.completionYear === "" ? null : number(raw.completionYear, "completionYear", 1900, 2100); const startDate = date(raw.startDate, "education startDate"); return fail(completionYear) ? completionYear : fail(startDate) ? startDate : { qualification, institution, ...values, completionYear, startDate }; });
  const workExperience = parseRows("workExperience", (raw) => { const employer = text(raw.employer, "employer", true); const jobTitle = text(raw.jobTitle, "jobTitle", true); const startDate = date(raw.startDate, "work startDate", true); if (fail(employer)) return employer; if (fail(jobTitle)) return jobTitle; if (fail(startDate) || !(startDate instanceof Date)) return { error: "work startDate is required." }; const values = optionalTextFields(raw, ["location", "responsibilities", "companyMobile", "companyEmail", "companyAddress", "companyWebsite", "jobType", "reportingName", "reportingTitle", "reportingMobile", "reportingEmail", "reasonForLeaving", "noticePeriod"]); if (fail(values)) return values; const endDate = date(raw.endDate, "work endDate"); const ctc = number(raw.ctc, "work ctc"); if (fail(endDate)) return endDate; if (fail(ctc)) return ctc; if (endDate && endDate < startDate) return { error: "work endDate cannot precede startDate." }; return { employer, jobTitle, startDate, ...values, endDate, ctc, isCurrent: raw.isCurrent === true }; });
  const documents = parseRows("documents", (raw) => { const name = text(raw.name, "document name", true); if (fail(name)) return name; const values = optionalTextFields(raw, ["docType", "number", "fileUrl", "notes"]); if (fail(values)) return values; const issuedDate = date(raw.issuedDate, "document issuedDate"); const expiryDate = date(raw.expiryDate, "document expiryDate"); return fail(issuedDate) ? issuedDate : fail(expiryDate) ? expiryDate : { name, ...values, docType: values.docType ?? "other", issuedDate, expiryDate }; });
  for (const value of [dependents, references, bankAccounts, education, workExperience, documents]) if (fail(value)) return NextResponse.json({ error: value.error }, { status: 400 });
  const dependentRows = dependents as Prisma.EmployeeDependentCreateManyInput[];
  const referenceRows = references as Prisma.EmployeeReferenceCreateManyInput[];
  const bankAccountRows = bankAccounts as Prisma.EmployeeBankAccountCreateManyInput[];
  const educationRows = education as Prisma.EmployeeEducationCreateManyInput[];
  const workExperienceRows = workExperience as Prisma.EmployeeWorkExperienceCreateManyInput[];
  const documentRows = documents as Prisma.DocumentCreateManyInput[];
  if (bankAccountRows.filter((account) => account.isPrimary).length > 1) return NextResponse.json({ error: "Only one bank account can be primary." }, { status: 400 });

  const profile = body.profile === undefined || body.profile === null ? body.profile : parseProfile(body.profile as Record<string, unknown>);
  const employment = body.employment === undefined || body.employment === null ? body.employment : parseEmployment(body.employment as Record<string, unknown>);
  if (fail(profile)) return NextResponse.json({ error: profile.error }, { status: 400 });
  if (fail(employment)) return NextResponse.json({ error: employment.error }, { status: 400 });
  const primary = body.bankAccounts === undefined ? undefined : bankAccountRows.find((account) => account.isPrimary);
  const employee = await prisma.$transaction(async (tx) => {
    if (profile !== undefined) profile === null ? await tx.employeeProfile.deleteMany({ where: { employeeId: id } }) : await tx.employeeProfile.upsert({ where: { employeeId: id }, create: { employeeId: id, ...profile as Prisma.EmployeeProfileCreateWithoutEmployeeInput }, update: profile as Prisma.EmployeeProfileUpdateWithoutEmployeeInput });
    if (employment !== undefined) employment === null ? await tx.employeeEmploymentProfile.deleteMany({ where: { employeeId: id } }) : await tx.employeeEmploymentProfile.upsert({ where: { employeeId: id }, create: { employeeId: id, ...employment as Prisma.EmployeeEmploymentProfileCreateWithoutEmployeeInput }, update: employment as Prisma.EmployeeEmploymentProfileUpdateWithoutEmployeeInput });
    if (body.dependents !== undefined) { await tx.employeeDependent.deleteMany({ where: { employeeId: id } }); if (dependentRows.length) await tx.employeeDependent.createMany({ data: dependentRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.references !== undefined) { await tx.employeeReference.deleteMany({ where: { employeeId: id } }); if (referenceRows.length) await tx.employeeReference.createMany({ data: referenceRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.bankAccounts !== undefined) { await tx.employeeBankAccount.deleteMany({ where: { employeeId: id } }); if (bankAccountRows.length) await tx.employeeBankAccount.createMany({ data: bankAccountRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.education !== undefined) { await tx.employeeEducation.deleteMany({ where: { employeeId: id } }); if (educationRows.length) await tx.employeeEducation.createMany({ data: educationRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.workExperience !== undefined) { await tx.employeeWorkExperience.deleteMany({ where: { employeeId: id } }); if (workExperienceRows.length) await tx.employeeWorkExperience.createMany({ data: workExperienceRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.documents !== undefined) { await tx.document.deleteMany({ where: { employeeId: id, tenantId: session.tenantId } }); if (documentRows.length) await tx.document.createMany({ data: documentRows.map(({ tenantId: _tenantId, employeeId: _employeeId, ...data }) => ({ ...data, tenantId: session.tenantId, employeeId: id })) }); }
    return tx.employee.update({ where: { id }, data: primary === undefined ? {} : { bankName: primary?.bankName ?? null, accountNumber: primary?.accountNumber ?? null, ifscCode: primary?.ifscCode ?? null }, include: { profile: true, employmentProfile: true, dependents: true, references: true, bankAccounts: true, education: true, workExperience: true, documents: true } });
  });
  return NextResponse.json({ employee });
}
