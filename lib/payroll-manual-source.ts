import type { Prisma } from "@/generated/prisma/client";
import { manualAttendanceSource, type ReviewedAttendanceRow } from "./payroll-attendance-import";
import { istDateKey } from "./ist";

export class ManualPayrollError extends Error {}

export async function resolveManualPayrollSource(db: Prisma.TransactionClient, tenantId: string, locationId: string | null | undefined, month: string, uploadId: string, employeeId: string) {
  const upload = await db.payrollAttendanceImport.findFirst({ where: { id: uploadId, tenantId, locationId: locationId ?? "", month, reviewedAt: { not: null } } });
  const rows = upload?.reviewedRows as unknown as ReviewedAttendanceRow[] | null;
  const row = rows?.find(row => row.employeeId === employeeId && !row.excluded);
  if (!row) throw new ManualPayrollError("Employee is not included in the reviewed attendance upload.");
  const employee = await db.employee.findFirst({ where: { id: employeeId, tenantId }, select: { joiningDate: true } });
  if (!employee) throw new ManualPayrollError("Employee no longer exists.");
  const joiningDay = employee.joiningDate ? istDateKey(employee.joiningDate) : null;
  const marks = row.marks.filter((_, day) => !joiningDay || `${month}-${String(day + 1).padStart(2, "0")}` >= joiningDay);
  if (!marks.length) throw new ManualPayrollError("Employee had not joined in this payroll month.");
  if (employee.joiningDate && row.marks.some((mark, day) => mark && `${month}-${String(day + 1).padStart(2, "0")}` < joiningDay!)) throw new ManualPayrollError("Joining date changed; attendance before joining requires a corrected upload.");
  return manualAttendanceSource(uploadId, { ...row, marks, workDays: marks.filter(mark => mark === "P" || mark === "OD").length, leaveDays: marks.filter(mark => mark === "L").length, blankDays: marks.filter(mark => !mark).length });
}
export function manualUploadId(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const source = (input as { manualAttendance?: { uploadId?: unknown } }).manualAttendance;
  return typeof source?.uploadId === "string" ? source.uploadId : null;
}
