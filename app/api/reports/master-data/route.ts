import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { formatDateIST } from "@/lib/dates";

const PLATFORM_COLUMNS = [
  "PN_Employee Number",
  "PN_Device Code",
  "PN_First Name",
  "PN_Last Name",
  "PN_Email",
  "PN_Phone",
  "PN_Status",
  "PN_Position",
  "PN_Joining Date",
  "PN_Branch",
  "PN_Department",
  "PN_Shift",
  "PN_Manager Employee Number",
  "PN_Monthly Salary",
  "PN_Pay Mode",
  "PN_Work Basis Rate",
  "PN_Bank Name",
  "PN_Account Number",
  "PN_IFSC Code",
  "PN_PAN",
  "PN_UAN",
  "PN_Aadhaar Number",
  "PN_Driving License Number",
  "PN_Driving License Expiry",
  "PN_Salary Structure",
  "PN_Education Records",
  "PN_Work Experience Records",
  "PN_Documents",
] as const;

function safeCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, loginOnly: false },
    select: {
      employeeNumber: true,
      deviceCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      position: true,
      joiningDate: true,
      salary: true,
      payMode: true,
      workBasisRate: true,
      bankName: true,
      accountNumber: true,
      ifscCode: true,
      pan: true,
      uan: true,
      aadhaarNumber: true,
      drivingLicenseNumber: true,
      drivingLicenseExpiresAt: true,
      salaryStructure: true,
      legacyImportData: true,
      branch: { select: { name: true } },
      department: { select: { name: true } },
      shift: { select: { name: true } },
      manager: { select: { employeeNumber: true } },
      education: { select: { qualification: true, specialization: true, institution: true, board: true, completionYear: true, grade: true } },
      workExperience: { select: { employer: true, jobTitle: true, startDate: true, endDate: true, isCurrent: true, location: true, responsibilities: true } },
      documents: { select: { name: true, docType: true, number: true, issuedDate: true, expiryDate: true, fileUrl: true, notes: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const importedColumns: string[] = [];
  const knownImportedColumns = new Set<string>();
  for (const employee of employees) {
    if (!employee.legacyImportData || typeof employee.legacyImportData !== "object" || Array.isArray(employee.legacyImportData)) continue;
    for (const key of Object.keys(employee.legacyImportData)) {
      if (!knownImportedColumns.has(key)) {
        knownImportedColumns.add(key);
        importedColumns.push(key);
      }
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeopleNexa";
  const sheet = workbook.addWorksheet("Employee Master");
  sheet.addRow([...PLATFORM_COLUMNS, ...importedColumns]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const employee of employees) {
    const imported = employee.legacyImportData && typeof employee.legacyImportData === "object" && !Array.isArray(employee.legacyImportData)
      ? employee.legacyImportData as Record<string, unknown>
      : {};
    const platformValues = [
      employee.employeeNumber, employee.deviceCode, employee.firstName, employee.lastName, employee.email, employee.phone,
      employee.status, employee.position, formatDateIST(employee.joiningDate), employee.branch?.name, employee.department?.name,
      employee.shift?.name, employee.manager?.employeeNumber, employee.salary, employee.payMode, employee.workBasisRate,
      employee.bankName, employee.accountNumber, employee.ifscCode, employee.pan, employee.uan, employee.aadhaarNumber,
      employee.drivingLicenseNumber, formatDateIST(employee.drivingLicenseExpiresAt), JSON.stringify(employee.salaryStructure ?? {}),
      JSON.stringify(employee.education), JSON.stringify(employee.workExperience), JSON.stringify(employee.documents),
    ];
    sheet.addRow([...platformValues, ...importedColumns.map((key) => imported[key])].map(safeCell));
  }

  sheet.columns.forEach((column, index) => {
    column.width = Math.min(42, Math.max(14, index < PLATFORM_COLUMNS.length ? 22 : 18));
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="peoplenexa-employee-master.xlsx"',
    },
  });
}
