import { employeeLocationScope } from "@/lib/location-scope";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { documentAttachment } from "@/lib/document-attachment";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{6,20}$/;
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

const employmentFinanceFields = new Set(["ctc", "salaryGroup", "salaryPaymentMode", "paySalaryFrom", "ptLocation", "tdsAllowed", "pfAllowed", "esicAllowed"]);

function employmentWithoutFinance<T extends object>(employment: T | null) {
  return employment && Object.fromEntries(Object.entries(employment).filter(([field]) => !employmentFinanceFields.has(field)));
}

function documentIdentity(raw: Record<string, unknown>) {
  const id = text(raw.id, "document ID");
  if (fail(id)) return id;
  const updatedAt = typeof raw.updatedAt === "string" ? new Date(raw.updatedAt) : null;
  if (raw.updatedAt != null && (!updatedAt || Number.isNaN(updatedAt.getTime()))) return { error: "Document revision is invalid." };
  return { id, updatedAt };
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
    where: { id, tenantId: session.tenantId, ...(locationId ? { AND: [employeeLocationScope(locationId)] } : {}), ...(branchId ? { branchId } : {}) },
    include: {
      profile: true,
      employmentProfile: true,
      dependents: true,
      references: true,
      bankAccounts: true,
      education: true,
      workExperience: true,
      documents: { where: { tenantId: session.tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.email?.endsWith("@device.local")) employee.email = null;
  const { password: _password, sessionVersion: _sessionVersion, legacyImportData, ...publicEmployee } = employee;
  if (session.role === "admin") return NextResponse.json({ employee: { ...publicEmployee, legacyImportData } });
  if (session.role === "location_manager") return NextResponse.json({ employee: publicEmployee });

  const { salary: _salary, bankName: _bankName, accountNumber: _account, ifscCode: _ifsc, pan: _pan, uan: _uan, esiIpNumber: _esi, salaryStructure: _salaryStructure, workBasisRate: _workBasisRate, bankAccounts: _bankAccounts, employmentProfile, workExperience, ...safeEmployee } = publicEmployee;
  return NextResponse.json({ employee: {
    ...safeEmployee,
    employmentProfile: employmentWithoutFinance(employmentProfile),
    bankAccounts: [],
    workExperience: workExperience.map(({ ctc: _ctc, ...record }) => record),
  } });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager" && session.role !== "branch_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Enter a valid employee record." }, { status: 400 });
  const body: Record<string, unknown> = payload;
  const { id } = await ctx.params;
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  const branchId = session.role === "branch_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true } }))?.branchId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  if (session.role === "branch_manager" && !branchId) return NextResponse.json({ error: "no branch assigned" }, { status: 403 });
  const where = { id, tenantId: session.tenantId, ...(locationId ? employeeLocationScope(locationId) : {}), ...(branchId ? { branchId } : {}) };
  const exists = await prisma.employee.findFirst({ where, select: { id: true, role: true, loginOnly: true } });
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role !== "admin" && (exists.loginOnly || ["admin", "branch_manager", "location_manager"].includes(exists.role))) {
    return NextResponse.json({ error: "Only workspace administrators can edit manager accounts." }, { status: 403 });
  }
  const canEditFinance = session.role !== "branch_manager";
  const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (body.expectedUpdatedAt !== undefined && (!expected || Number.isNaN(expected.getTime()))) return NextResponse.json({ error: "Employee record revision is invalid." }, { status: 400 });

  const collections = ["dependents", "references", "bankAccounts", "education", "workExperience", "documents", "removedDocuments"] as const;
  for (const field of collections) if (body[field] !== undefined && !Array.isArray(body[field])) return NextResponse.json({ error: `${field} must be an array.` }, { status: 400 });
  for (const field of ["profile", "employment"] as const) if (body[field] !== undefined && body[field] !== null && fail(object(body[field], field))) return NextResponse.json({ error: `${field} must be an object.` }, { status: 400 });
  if (!canEditFinance && ((Array.isArray(body.bankAccounts) && body.bankAccounts.length > 0) || body.employment === null)) {
    return NextResponse.json({ error: "Only workspace or location administrators can change payroll and bank details." }, { status: 403 });
  }

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
    const values = optionalTextFields(raw, ["middleName", "fullName", "nameAsOnAadhaar", "nickName", "gender", "celebrateDatePreference", "maritalStatus", "bloodGroup", "whatsappNumber", "otherMobile", "personalEmail", "placeOfBirth", "nationality", "citizenship", "fatherName", "motherName", "emergencyContactName", "emergencyContactNumber", "emergencyContactRelation"]);
    if (fail(values)) return values;
    if (Object.hasOwn(raw, "spouseName")) {
      const spouseName = text(raw.spouseName, "spouseName");
      if (fail(spouseName)) return spouseName;
      if (spouseName && spouseName.length > 200) return { error: "spouseName must be 200 characters or fewer." };
      values.spouseName = spouseName;
    }
    if (Object.hasOwn(raw, "spouseContactNumber")) {
      const spouseContactNumber = text(raw.spouseContactNumber, "spouseContactNumber");
      if (fail(spouseContactNumber)) return spouseContactNumber;
      if (spouseContactNumber && !PHONE_RE.test(spouseContactNumber)) return { error: "spouseContactNumber must be a valid phone number." };
      values.spouseContactNumber = spouseContactNumber;
    }
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
    return canEditFinance ? values : employmentWithoutFinance(values)!;
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
  const documents = parseRows("documents", (raw) => {
    const identity = documentIdentity(raw); if (fail(identity)) return identity;
    const name = text(raw.name, "document name", true);
    if (typeof name !== "string") return { error: "Document name is required." };
    const values = optionalTextFields(raw, ["docType", "number", "notes"]); if (fail(values)) return values;
    const issuedDate = date(raw.issuedDate, "document issue date"); if (fail(issuedDate)) return issuedDate;
    const expiryDate = date(raw.expiryDate, "document expiry date"); if (fail(expiryDate)) return expiryDate;
    if (raw.fileUrl != null && typeof raw.fileUrl !== "string") return { error: "Document attachment must be a supported URL." };
    return { ...identity, name, docType: values.docType ?? "other", number: values.number, notes: values.notes, issuedDate, expiryDate, fileUrl: typeof raw.fileUrl === "string" ? raw.fileUrl.trim() || null : raw.fileUrl === null ? null : undefined };
  });
  const removed = parseRows("removedDocuments", (raw) => {
    const identity = documentIdentity(raw);
    return fail(identity) ? identity : typeof identity.id === "string" ? { ...identity, id: identity.id } : { error: "Select the document to remove." };
  });
  if (fail(documents) || fail(removed)) return NextResponse.json({ error: fail(documents) ? documents.error : fail(removed) ? removed.error : "Invalid documents." }, { status: 400 });
  for (const value of [dependents, references, bankAccounts, education, workExperience]) if (fail(value)) return NextResponse.json({ error: value.error }, { status: 400 });
  const documentIds = [...documents.flatMap((row) => row.id ? [row.id] : []), ...removed.map((row) => row.id)];
  if (new Set(documentIds).size !== documentIds.length) return NextResponse.json({ error: "Each document can be changed once per save." }, { status: 400 });
  const dependentRows = dependents as Prisma.EmployeeDependentCreateManyInput[];
  const referenceRows = references as Prisma.EmployeeReferenceCreateManyInput[];
  const bankAccountRows = bankAccounts as Prisma.EmployeeBankAccountCreateManyInput[];
  const educationRows = education as Prisma.EmployeeEducationCreateManyInput[];
  const workExperienceRows = workExperience as Prisma.EmployeeWorkExperienceCreateManyInput[];
  if (bankAccountRows.filter((account) => account.isPrimary).length > 1) return NextResponse.json({ error: "Only one bank account can be primary." }, { status: 400 });

  const profile = body.profile === undefined || body.profile === null ? body.profile : parseProfile(body.profile as Record<string, unknown>);
  const employment = body.employment === undefined || body.employment === null ? body.employment : parseEmployment(body.employment as Record<string, unknown>);
  if (fail(profile)) return NextResponse.json({ error: profile.error }, { status: 400 });
  if (fail(employment)) return NextResponse.json({ error: employment.error }, { status: 400 });
  const updateBankAccounts = canEditFinance && body.bankAccounts !== undefined;
  const primary = bankAccountRows.find((account) => account.isPrimary);
  const workSources = Array.isArray(body.workExperience) ? body.workExperience as Record<string, unknown>[] : [];
  try {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.employee.findFirst({ where, select: { role: true, loginOnly: true, updatedAt: true } });
    if (!current) return { error: "Employee no longer belongs to your scope.", status: 404 } as const;
    if (session.role !== "admin" && (current.loginOnly || ["admin", "branch_manager", "location_manager"].includes(current.role))) return { error: "Only workspace administrators can edit manager accounts.", status: 403 } as const;
    if (expected && expected.getTime() !== current.updatedAt.getTime()) return { error: "Employee records changed. Reopen the editor before saving." , status: 409 } as const;
    const documentScope = { tenantId: session.tenantId, employeeId: id };
    const savedDocuments = documentIds.length ? await tx.document.findMany({ where: { ...documentScope, id: { in: documentIds } } }) : [];
    const byId = new Map(savedDocuments.map((record) => [record.id, record]));
    for (const row of [...documents, ...removed]) {
      if (!row.id) continue;
      const previous = byId.get(row.id);
      if (!previous) return { error: "Document not found in this employee record.", status: 404 } as const;
      if (row.updatedAt && row.updatedAt.getTime() !== previous.updatedAt.getTime()) return { error: "A document changed. Reopen the employee record before saving it.", status: 409 } as const;
    }
    for (const row of documents) {
      const previous = row.id ? byId.get(row.id) : undefined;
      if (row.fileUrl && row.fileUrl !== previous?.fileUrl && !documentAttachment(row.fileUrl, session.tenantId)) return { error: "Use a supported attachment or an HTTPS document link.", status: 400 } as const;
      if (row.issuedDate && row.expiryDate && row.expiryDate < row.issuedDate
        && (row.issuedDate.getTime() !== previous?.issuedDate?.getTime() || row.expiryDate.getTime() !== previous?.expiryDate?.getTime())) {
        return { error: "Document expiry date must be on or after the issue date.", status: 400 } as const;
      }
    }
    if (profile !== undefined) {
      if (profile === null) await tx.employeeProfile.deleteMany({ where: { employeeId: id } });
      else await tx.employeeProfile.upsert({ where: { employeeId: id }, create: { employeeId: id, ...profile as Prisma.EmployeeProfileCreateWithoutEmployeeInput }, update: profile as Prisma.EmployeeProfileUpdateWithoutEmployeeInput });
    }
    if (employment !== undefined) {
      if (employment === null) await tx.employeeEmploymentProfile.deleteMany({ where: { employeeId: id } });
      else await tx.employeeEmploymentProfile.upsert({ where: { employeeId: id }, create: { employeeId: id, ...employment as Prisma.EmployeeEmploymentProfileCreateWithoutEmployeeInput }, update: employment as Prisma.EmployeeEmploymentProfileUpdateWithoutEmployeeInput });
    }
    if (body.dependents !== undefined) { await tx.employeeDependent.deleteMany({ where: { employeeId: id } }); if (dependentRows.length) await tx.employeeDependent.createMany({ data: dependentRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.references !== undefined) { await tx.employeeReference.deleteMany({ where: { employeeId: id } }); if (referenceRows.length) await tx.employeeReference.createMany({ data: referenceRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (updateBankAccounts) { await tx.employeeBankAccount.deleteMany({ where: { employeeId: id } }); if (bankAccountRows.length) await tx.employeeBankAccount.createMany({ data: bankAccountRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.education !== undefined) { await tx.employeeEducation.deleteMany({ where: { employeeId: id } }); if (educationRows.length) await tx.employeeEducation.createMany({ data: educationRows.map(({ employeeId: _employeeId, ...data }) => ({ ...data, employeeId: id })) }); }
    if (body.workExperience !== undefined) {
      const currentWork = canEditFinance ? [] : await tx.employeeWorkExperience.findMany({ where: { employeeId: id }, select: { id: true, ctc: true } });
      const savedPay = new Map(currentWork.map((record) => [record.id, record.ctc]));
      await tx.employeeWorkExperience.deleteMany({ where: { employeeId: id } });
      if (workExperienceRows.length) await tx.employeeWorkExperience.createMany({ data: workExperienceRows.map(({ employeeId: _employeeId, ...data }, index) => ({
        ...data, employeeId: id,
        ...(canEditFinance ? {} : { ctc: savedPay.get(String(workSources[index]?.id ?? "")) ?? null }),
      })) });
    }
    if (removed.length) await tx.document.deleteMany({ where: { ...documentScope, id: { in: removed.map((row) => row.id) } } });
    for (const { id: documentId, updatedAt: _updatedAt, ...document } of documents) {
      if (documentId) await tx.document.update({ where: { id: documentId, ...documentScope }, data: document });
      else await tx.document.create({ data: { ...document, ...documentScope } });
    }
    const employee = await tx.employee.update({
      where,
      data: { updatedAt: new Date(), ...(updateBankAccounts ? { bankName: primary?.bankName ?? null, accountNumber: primary?.accountNumber ?? null, ifscCode: primary?.ifscCode ?? null } : {}) },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, updatedAt: true },
    });
    return { employee } as const;
  }, { isolationLevel: "Serializable" });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ employee: result.employee });
  } catch (error) {
    if (["P2025", "P2034"].includes((error as { code?: string })?.code ?? "")) return NextResponse.json({ error: "Employee records changed. Reopen the editor before saving." }, { status: 409 });
    throw error;
  }
}
