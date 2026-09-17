import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const MIGRATION = "20260918000006_employee_master_profiles";
const PLACEHOLDER_RE = /^(?:select(?:\s+.*)?|n\/?a|na|null|nil|--|-|0+)$/i;

type Source = Record<string, unknown>;
type Counts = Record<string, number>;

function count(counts: Counts, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function key(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function source(value: unknown): Source | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Source : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return !result || PLACEHOLDER_RE.test(result) ? null : result;
}

function values(row: Source) {
  return new Map(Object.entries(row).map(([name, value]) => [key(name), value]));
}

function field(row: Map<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = text(row.get(key(name)));
    if (value) return value;
  }
  return null;
}

function strictDate(value: string | null, warning: string, warnings: Counts): Date | null {
  if (!value) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) {
    count(warnings, `invalid_date:${warning}`);
    return null;
  }
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    count(warnings, `invalid_date:${warning}`);
    return null;
  }
  return date;
}

function number(value: string | null, warning: string, warnings: Counts): number | null {
  if (!value) return null;
  const result = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(result) || result < 0) {
    count(warnings, `invalid_number:${warning}`);
    return null;
  }
  return result;
}

function boolean(value: string | null, warning: string, warnings: Counts): boolean | null {
  if (!value) return null;
  if (/^(?:yes|y|true|1)$/i.test(value)) return true;
  if (/^(?:no|n|false|0)$/i.test(value)) return false;
  count(warnings, `invalid_boolean:${warning}`);
  return null;
}

function address(row: Map<string, unknown>, prefix: "PER_Current" | "PER_Permanet"): Prisma.InputJsonValue | null {
  const result = {
    country: field(row, `${prefix} Country`),
    flatHouseWingNumber: field(row, `${prefix} Flat / House/Wing Number`),
    landmark: field(row, `${prefix} Landmark`),
    state: field(row, `${prefix} State`),
    streetLocalityArea: field(row, `${prefix} Street / Locality / Area`),
  };
  return Object.values(result).some(Boolean) ? result as Prisma.InputJsonValue : null;
}

function blank(value: unknown) {
  return value === null || value === undefined || value === "";
}

function fillBlank<T extends Record<string, unknown>>(existing: T | null, incoming: T) {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== null && value !== undefined && (!existing || blank(existing[name]))) result[name] = value;
  }
  return result;
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function servicePeriod(value: string | null, warnings: Counts) {
  if (!value) return null;
  const match = /^(\d{2}-\d{2}-\d{4})(?:\s*(?:to|-)\s*(\d{2}-\d{2}-\d{4}))?$/i.exec(value);
  if (!match) {
    count(warnings, "invalid_date:work.service_period");
    return null;
  }
  const startDate = strictDate(match[1], "work.start_date", warnings);
  const endDate = strictDate(match[2] ?? null, "work.end_date", warnings);
  return startDate ? { startDate, endDate, isCurrent: !endDate } : null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tenantSlug = args.find((arg) => arg.startsWith("--tenant="))?.slice("--tenant=".length) || "ksipl";
  if (args.some((arg) => arg !== "--apply" && !arg.startsWith("--tenant="))) throw new Error("Usage: tsx scripts/backfill-legacy-employee-profiles.ts [--tenant=ksipl] [--apply]");

  const migration = await prisma.$queryRaw<Array<{ finishedAt: Date | null }>>`
    SELECT "finished_at" AS "finishedAt" FROM "_prisma_migrations" WHERE "migration_name" = ${MIGRATION} LIMIT 1
  `;
  if (!migration[0]?.finishedAt) throw new Error(`Migration '${MIGRATION}' must be applied before this backfill.`);

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) throw new Error("Requested tenant was not found.");

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, legacyImportData: { not: Prisma.JsonNull } },
    select: {
      id: true,
      legacyImportData: true,
      profile: true,
      employmentProfile: true,
      bankAccounts: true,
      education: true,
      workExperience: true,
    },
  });
  const warnings: Counts = {};
  const errors: Counts = {};
  const planned: Counts = {};
  const operations: Array<(tx: Prisma.TransactionClient) => Promise<unknown>> = [];

  for (const employee of employees) {
    try {
      const raw = source(employee.legacyImportData);
      if (!raw) {
        count(warnings, "invalid_legacy_snapshot");
        continue;
      }
      const row = values(raw);
      const profile = {
        middleName: field(row, "RPT_Middle Name"),
        nameAsOnAadhaar: field(row, "RPT_Name As Per Aadhaar", "RPT_Name As On Aadhaar"),
        nickName: field(row, "RPT_Nick Name", "RPT_Nickname"),
        gender: field(row, "RPT_Gender", "PER_Gender"),
        dateOfBirthCertificate: strictDate(field(row, "RPT_Date Of Birth As Per Certificate", "ID_Dob As Per Document"), "profile.document_dob", warnings),
        actualDateOfBirth: strictDate(field(row, "RPT_Actual Date Of Birth"), "profile.actual_dob", warnings),
        celebrateDatePreference: field(row, "RPT_Which Date You Want To Celebrate", "PER_Which date do you want to celebrate?"),
        maritalStatus: field(row, "RPT_Marital Status", "PER_Marriage Status"),
        spouseName: field(row, "RPT_Spouse Name", "PER_Spouse Name"),
        marriageDate: strictDate(field(row, "RPT_Marriage Date", "PER_Marriage Date"), "profile.marriage_date", warnings),
        bloodGroup: field(row, "PER_Blood Group"),
        whatsappNumber: field(row, "RPT_WhatsApp No", "RPT_Whatsapp Number", "RPT_WhatsApp Number"),
        otherMobile: field(row, "RPT_Other Mobile No", "RPT_Alternate Mobile No"),
        personalEmail: field(row, "RPT_Personal Email Address", "RPT_Personal Email ID", "RPT_Personal Email"),
        placeOfBirth: field(row, "RPT_Place Of Birth"),
        nationality: field(row, "RPT_Nationality"),
        citizenship: field(row, "RPT_Citizenship"),
        fatherName: field(row, "RPT_Father's Name", "RPT_Father Name"),
        motherName: field(row, "RPT_Mother's Name", "RPT_Mother Name"),
        emergencyContactName: field(row, "RPT_Emergency Contact Name"),
        emergencyContactNumber: field(row, "RPT_Emergency Contact Number"),
        emergencyContactRelation: field(row, "RPT_Relation", "RPT_Emergency Contact Relation"),
        currentAddress: address(row, "PER_Current"),
        permanentAddress: address(row, "PER_Permanet"),
      };
      const employment = {
        rejoiningDate: strictDate(field(row, "OFF_reJoinDate"), "employment.rejoining_date", warnings),
        statusUpdatedAt: strictDate(field(row, "OFF_statusUpdateDate"), "employment.status_updated_at", warnings),
        employmentMode: field(row, "OFF_empModeDbKey"),
        natureOfEmployment: field(row, "OFF_natureOfEmploymentDbKey"),
        probationPeriod: field(row, "OFF_probationPeriod"),
        totalExperience: field(row, "OFF_totalExperience"),
        salaryGroup: field(row, "OFF_salaryGroup"),
        ctc: number(field(row, "OFF_ctc"), "employment.ctc", warnings),
        salaryPaymentMode: field(row, "OFF_salaryPaymentMode"),
        paySalaryFrom: field(row, "OFF_paySalaryFrom"),
        tdsAllowed: boolean(field(row, "OFF_tdsAllowed"), "employment.tds_allowed", warnings),
        pfAllowed: boolean(field(row, "OFF_pfAllowed"), "employment.pf_allowed", warnings),
        esicAllowed: boolean(field(row, "OFF_esicAllowed"), "employment.esic_allowed", warnings),
        ptLocation: field(row, "OFF_ptLocation"),
        autoCreditLeave: boolean(field(row, "OFF_autoCreditLeave"), "employment.auto_credit_leave", warnings),
        subDepartment: field(row, "RPT_Sub Department"),
        grade: field(row, "RPT_Grade"),
        vehicleCategory: field(row, "OFF_vehicleCatagoryDbKey"),
        vehicleClass: field(row, "OFF_vehicleClassNameDbKey"),
        vehicleSubClass: field(row, "OFF_vehicleSubClassNameDbKey"),
        licenseRequired: boolean(field(row, "OFF_cnqoLisenceRequired"), "employment.license_required", warnings),
        extensionNumber: field(row, "OFF_extensionNumber"),
        secondManagerCode: field(row, "OFF_secondReportingManagerDbKey"),
        hrManagerCode: field(row, "OFF_reportingHrDbKey"),
      };
      const profileChanges = fillBlank(employee.profile, profile);
      const employmentChanges = fillBlank(employee.employmentProfile, employment);
      if (Object.keys(profileChanges).length) {
        count(planned, employee.profile ? "profilesUpdated" : "profilesCreated");
        operations.push((tx) => employee.profile
          ? tx.employeeProfile.update({ where: { employeeId: employee.id }, data: profileChanges })
          : tx.employeeProfile.create({ data: { employeeId: employee.id, ...profileChanges } as Prisma.EmployeeProfileUncheckedCreateInput }));
      }
      if (Object.keys(employmentChanges).length) {
        count(planned, employee.employmentProfile ? "employmentProfilesUpdated" : "employmentProfilesCreated");
        operations.push((tx) => employee.employmentProfile
          ? tx.employeeEmploymentProfile.update({ where: { employeeId: employee.id }, data: employmentChanges })
          : tx.employeeEmploymentProfile.create({ data: { employeeId: employee.id, ...employmentChanges } as Prisma.EmployeeEmploymentProfileUncheckedCreateInput }));
      }

      const accountNumber = field(row, "BANK_Bank Account Number");
      if (accountNumber && !employee.bankAccounts.some((account) => sameText(account.accountNumber, accountNumber))) {
        count(planned, "bankAccountsCreated");
        operations.push((tx) => tx.employeeBankAccount.create({ data: {
          employeeId: employee.id, accountNumber, ifscCode: field(row, "BANK_IFSC Code"), accountHolder: field(row, "BANK_Name As Per Bank Records"),
          accountType: field(row, "BANK_Bank Account Type"), bankName: field(row, "BANK_Bank Name"), bankBranch: field(row, "BANK_Bank Branch"),
          status: field(row, "BANK_Status"), isPrimary: employee.bankAccounts.length === 0,
        } }));
      }

      const qualification = field(row, "EDU_Education Degree");
      const institution = field(row, "EDU_Institute");
      if (qualification && institution && !employee.education.some((entry) => sameText(entry.qualification, qualification) && sameText(entry.institution, institution))) {
        const completion = strictDate(field(row, "EDU_Completion Date"), "education.completion_date", warnings);
        count(planned, "educationCreated");
        operations.push((tx) => tx.employeeEducation.create({ data: {
          employeeId: employee.id, qualification, institution, specialization: field(row, "EDU_Field of Specialisation"), board: field(row, "EDU_University"),
          completionYear: completion?.getUTCFullYear(), grade: field(row, "EDU_GPA / Pecentage"), courseType: field(row, "EDU_Course / Degree Type"),
          educationMode: field(row, "EDU_Education Mode"), startDate: strictDate(field(row, "EDU_Start Date"), "education.start_date", warnings),
        } }));
      } else if ((qualification && !institution) || (!qualification && institution)) count(warnings, "incomplete_education");

      const employer = field(row, "WRK_Company Name");
      const jobTitle = field(row, "WRK_Job Title");
      const period = servicePeriod(field(row, "WRK_Service Period"), warnings);
      if (employer && jobTitle && period && !employee.workExperience.some((entry) => sameText(entry.employer, employer) && sameText(entry.jobTitle, jobTitle) && entry.startDate.getTime() === period.startDate.getTime())) {
        count(planned, "workExperienceCreated");
        operations.push((tx) => tx.employeeWorkExperience.create({ data: {
          employeeId: employee.id, employer, jobTitle, ...period, location: field(row, "WRK_Job Location"), responsibilities: field(row, "WRK_Job Summary"),
          companyMobile: field(row, "WRK_Company Mobile"), companyEmail: field(row, "WRK_Company Email"), companyAddress: field(row, "WRK_Company Working Address"),
          companyWebsite: field(row, "WRK_Company Website"), jobType: field(row, "WRK_Job Type"), ctc: number(field(row, "WRK_CTC"), "work.ctc", warnings),
          reportingName: field(row, "WRK_Reporting Authority Name"), reportingTitle: field(row, "WRK_Reporting Authority Designation"), reportingMobile: field(row, "WRK_Reporting Authority Mobile"),
          reportingEmail: field(row, "WRK_Reporting Authority Official Email ID"), noticePeriod: field(row, "WRK_Notice Period Server"),
        } }));
      } else if (employer || jobTitle || period) count(warnings, "incomplete_work_experience");
    } catch {
      count(errors, "employee_processing_failed");
    }
  }

  const report = { mode: apply ? "apply" : "dry-run", tenant: tenantSlug, employeesScanned: employees.length, planned, warnings, errors };
  console.log(JSON.stringify(report, null, 2));
  if (Object.keys(errors).length || !apply) return;
  await prisma.$transaction(async (tx) => { for (const operation of operations) await operation(tx); }, { timeout: 120_000 });
  console.log(JSON.stringify({ applied: planned }, null, 2));
}

main().catch(() => {
  console.error(JSON.stringify({ errors: { fatal: 1 } }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
