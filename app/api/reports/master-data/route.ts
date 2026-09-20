import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { formatDateIST as formatIstDate } from "@/lib/dates";

type Cell = string | number | boolean | null | undefined;

function formatDateIST(value: Date | string | null | undefined): string {
  return value ? formatIstDate(value) : "";
}

function safeCell(value: Cell): string | number | boolean {
  if (typeof value !== "string") return value ?? "";
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function address(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const addressLine = record.addressLine ?? record.line1 ?? [record.flatHouseWingNumber, record.streetLocalityArea].filter((part) => part != null && String(part).trim()).join(", ");
  return [addressLine, record.landmark, record.city ?? record.district ?? record.town, record.state, record.postalCode ?? record.pinCode ?? record.pincode ?? record.zipCode, record.country]
    .map((part) => part == null ? "" : String(part).replace(/^Select\.\.\.\s*/i, "").trim())
    .filter(Boolean)
    .join(", ");
}

function yesNo(value: boolean | null | undefined): string {
  return value == null ? "" : value ? "Yes" : "No";
}

function columnName(index: number): string {
  let name = "";
  while (index > 0) { const remainder = (index - 1) % 26; name = String.fromCharCode(65 + remainder) + name; index = Math.floor((index - 1) / 26); }
  return name;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: Cell[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${columnName(headers.length)}1` };
  for (const row of rows) sheet.addRow(row.map(safeCell));
  sheet.columns.forEach((column, index) => { column.width = Math.min(36, Math.max(14, headers[index]?.length ?? 14)); });
  return sheet;
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const locationId = session.role === "location_manager"
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  if (session.role === "location_manager" && !locationId) return NextResponse.json({ error: "no location assigned" }, { status: 403 });

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, loginOnly: false, ...(locationId ? { branch: { locationId } } : {}) },
    select: {
      employeeNumber: true, deviceCode: true, firstName: true, lastName: true, email: true, phone: true, status: true, position: true, joiningDate: true,
      salary: true, payMode: true, workBasisRate: true, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true, aadhaarNumber: true,
      drivingLicenseNumber: true, drivingLicenseType: true, drivingLicenseExpiresAt: true,
      branch: { select: { name: true, location: { select: { name: true } } } }, department: { select: { name: true } }, shift: { select: { name: true } }, manager: { select: { employeeNumber: true, firstName: true, lastName: true } },
      profile: true, employmentProfile: true, dependents: true, references: true, bankAccounts: true,
      education: true, workExperience: true,
      documents: { select: { name: true, docType: true, number: true, issuedDate: true, expiryDate: true, fileUrl: true, notes: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleNexa";
  workbook.created = new Date();
  addSheet(workbook, "Employees", [
    "Employee Number", "Device Code", "First Name", "Last Name", "Work Email", "Phone", "Status", "Position", "Joining Date", "Location", "Branch", "Department", "Shift", "Reporting Manager", "Pay Mode", "Salary / Rate", "Work Basis Rate",
    "PAN", "UAN", "Aadhaar Number", "Driving Licence Number", "Driving Licence Type", "Driving Licence Expiry",
    "Middle Name", "Name as on Aadhaar", "Nickname", "Gender", "Birth Date (Certificate)", "Actual Birth Date", "Celebration Preference", "Marital Status", "Spouse Name", "Marriage Date", "Blood Group", "WhatsApp Number", "Other Mobile", "Personal Email", "Place of Birth", "Nationality", "Citizenship", "Father Name", "Mother Name", "Emergency Contact Name", "Emergency Contact Number", "Emergency Contact Relation", "Current Address", "Permanent Address",
    "Rejoining Date", "Employment Mode", "Nature of Employment", "Probation Period", "Total Experience", "Salary Group", "CTC", "Salary Payment Mode", "Pay Salary From", "TDS Allowed", "PF Allowed", "ESIC Allowed", "PT Location", "Auto Credit Leave", "Sub Department", "Grade", "Vehicle Category", "Vehicle Class", "Vehicle Subclass", "Licence Required", "Extension Number", "Second Manager Code", "HR Manager Code",
  ], employees.map((employee) => {
    const profile = employee.profile; const employment = employee.employmentProfile;
    return [employee.employeeNumber, employee.deviceCode, employee.firstName, employee.lastName, employee.email, employee.phone, employee.status, employee.position, formatDateIST(employee.joiningDate), employee.branch?.location?.name, employee.branch?.name, employee.department?.name, employee.shift?.name, employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName} (${employee.manager.employeeNumber})` : "", employee.payMode, employee.salary, employee.workBasisRate,
      employee.pan, employee.uan, employee.aadhaarNumber, employee.drivingLicenseNumber, employee.drivingLicenseType, formatDateIST(employee.drivingLicenseExpiresAt),
      profile?.middleName, profile?.nameAsOnAadhaar, profile?.nickName, profile?.gender, formatDateIST(profile?.dateOfBirthCertificate), formatDateIST(profile?.actualDateOfBirth), profile?.celebrateDatePreference, profile?.maritalStatus, profile?.spouseName, formatDateIST(profile?.marriageDate), profile?.bloodGroup, profile?.whatsappNumber, profile?.otherMobile, profile?.personalEmail, profile?.placeOfBirth, profile?.nationality, profile?.citizenship, profile?.fatherName, profile?.motherName, profile?.emergencyContactName, profile?.emergencyContactNumber, profile?.emergencyContactRelation, address(profile?.currentAddress), address(profile?.permanentAddress),
      formatDateIST(employment?.rejoiningDate), employment?.employmentMode, employment?.natureOfEmployment, employment?.probationPeriod, employment?.totalExperience, employment?.salaryGroup, employment?.ctc, employment?.salaryPaymentMode, employment?.paySalaryFrom, yesNo(employment?.tdsAllowed), yesNo(employment?.pfAllowed), yesNo(employment?.esicAllowed), employment?.ptLocation, yesNo(employment?.autoCreditLeave), employment?.subDepartment, employment?.grade, employment?.vehicleCategory, employment?.vehicleClass, employment?.vehicleSubClass, yesNo(employment?.licenseRequired), employment?.extensionNumber, employment?.secondManagerCode, employment?.hrManagerCode];
  }));
  addSheet(workbook, "Bank Accounts", ["Employee Number", "Account Holder", "Account Number", "IFSC Code", "Bank Name", "Bank Branch", "Account Type", "Status", "Primary Account"], employees.flatMap((employee) => employee.bankAccounts.map((account) => [employee.employeeNumber, account.accountHolder, account.accountNumber, account.ifscCode, account.bankName, account.bankBranch, account.accountType, account.status, yesNo(account.isPrimary)])));
  addSheet(workbook, "Education", ["Employee Number", "Qualification", "Specialization", "Institution", "Board", "Completion Year", "Grade", "Course Type", "Education Mode", "Start Date"], employees.flatMap((employee) => employee.education.map((entry) => [employee.employeeNumber, entry.qualification, entry.specialization, entry.institution, entry.board, entry.completionYear, entry.grade, entry.courseType, entry.educationMode, formatDateIST(entry.startDate)])));
  addSheet(workbook, "Work Experience", ["Employee Number", "Employer", "Job Title", "Start Date", "End Date", "Current Role", "Location", "Responsibilities", "Company Mobile", "Company Email", "Company Address", "Company Website", "Job Type", "CTC", "Reporting Name", "Reporting Title", "Reporting Mobile", "Reporting Email", "Reason for Leaving", "Notice Period"], employees.flatMap((employee) => employee.workExperience.map((entry) => [employee.employeeNumber, entry.employer, entry.jobTitle, formatDateIST(entry.startDate), formatDateIST(entry.endDate), yesNo(entry.isCurrent), entry.location, entry.responsibilities, entry.companyMobile, entry.companyEmail, entry.companyAddress, entry.companyWebsite, entry.jobType, entry.ctc, entry.reportingName, entry.reportingTitle, entry.reportingMobile, entry.reportingEmail, entry.reasonForLeaving, entry.noticePeriod])));
  addSheet(workbook, "Dependents", ["Employee Number", "First Name", "Middle Name", "Last Name", "Relation", "Date of Birth", "Aadhaar Number", "Mobile", "Email", "Occupation", "Nominee Share (%)", "Address"], employees.flatMap((employee) => employee.dependents.map((entry) => [employee.employeeNumber, entry.firstName, entry.middleName, entry.lastName, entry.relation, formatDateIST(entry.dateOfBirth), entry.aadhaarNumber, entry.mobile, entry.email, entry.occupation, entry.nomineeShare, entry.address])));
  addSheet(workbook, "References", ["Employee Number", "Name", "Relation", "Mobile", "Email", "Occupation", "Address"], employees.flatMap((employee) => employee.references.map((entry) => [employee.employeeNumber, entry.name, entry.relation, entry.mobile, entry.email, entry.occupation, entry.address])));
  addSheet(workbook, "Documents", ["Employee Number", "Document Name", "Document Type", "Document Number", "Issue Date", "Expiry Date", "File URL", "Notes"], employees.flatMap((employee) => employee.documents.map((entry) => [employee.employeeNumber, entry.name, entry.docType, entry.number, formatDateIST(entry.issuedDate), formatDateIST(entry.expiryDate), entry.fileUrl, entry.notes])));

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="peoplenexa-employee-master.xlsx"' } });
}
