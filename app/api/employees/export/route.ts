import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

const HEADERS = [
  "employeeNumber", "deviceCode", "firstName", "lastName", "email", "phone", "position", "salary", "joiningDate",
  "branch", "department", "shiftId", "payMode", "workBasisRate", "managerId", "status", "bankName", "accountNumber", "ifscCode", "pan", "uan",
] as const;

function cell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, loginOnly: false },
    select: {
      employeeNumber: true, deviceCode: true, firstName: true, lastName: true, email: true, phone: true, position: true, salary: true,
      joiningDate: true, payMode: true, workBasisRate: true, managerId: true, status: true, bankName: true, accountNumber: true, ifscCode: true, pan: true, uan: true,
      branch: { select: { name: true } }, department: { select: { name: true } }, shiftId: true,
    },
    orderBy: { employeeNumber: "asc" },
  });
  const rows = employees.map((employee) => [
    employee.employeeNumber, employee.deviceCode, employee.firstName, employee.lastName, employee.email, employee.phone, employee.position, employee.salary,
    employee.joiningDate ? employee.joiningDate.toISOString().slice(0, 10) : "", employee.branch?.name, employee.department?.name, employee.shiftId,
    employee.payMode, employee.workBasisRate, employee.managerId, employee.status, employee.bankName, employee.accountNumber, employee.ifscCode, employee.pan, employee.uan,
  ].map(cell).join(","));
  const csv = [HEADERS.join(","), ...rows].join("\r\n") + "\r\n";
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="employees-export.csv"' } });
}
