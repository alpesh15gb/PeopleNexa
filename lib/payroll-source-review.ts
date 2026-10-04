import type { Prisma } from "@/generated/prisma/client";
import { attendanceSummary, monthRange } from "./payroll";

const fields = ["presentDays", "lateDays", "halfDays", "absentDays", "onLeaveDays", "paidLeaveDays", "unpaidLeaveDays", "overtimeHours", "workingDays", "workedHours"] as const;
export function attendanceChanged(saved: unknown, current: unknown) {
  if (!saved || typeof saved !== "object" || !current || typeof current !== "object") return true;
  const a = saved as Record<string, unknown>, b = current as Record<string, unknown>;
  return fields.some((key) => {
    const old = a[key] ?? 0, next = b[key] ?? 0;
    return typeof old !== "number" || typeof next !== "number" || !Number.isFinite(old) || !Number.isFinite(next) || Math.abs(old - next) > 0.000001;
  }) || Boolean(a.legacyLeavePayWarning) !== Boolean(b.legacyLeavePayWarning);
}

export async function payrollSourceReview(tx: Prisma.TransactionClient, tenantId: string, month: string, slips: Array<{ employeeId: string; inputSnapshot: unknown; employee: { id: string; shiftId: string | null; joiningDate: Date | null; firstName: string; lastName: string } }>) {
  const { start, end } = monthRange(month);
  const unresolved = await tx.leaveRequest.count({ where: { tenantId, employeeId: { in: slips.map((slip) => slip.employeeId) }, fromDate: { lt: end }, toDate: { gte: start }, OR: [{ status: "pending" }, { status: "approved", cancellationRequestedBy: { not: null } }] } });
  if (unresolved) return [`Resolve ${unresolved} pending leave or cancellation decision(s) for this payroll month before review.`];
  const errors: string[] = [];
  // A bounded batch avoids hundreds of concurrent database queries.
  for (let index = 0; index < slips.length; index += 4) {
    const results = await Promise.all(slips.slice(index, index + 4).map(async (slip) => {
      const input = slip.inputSnapshot as { attendance?: unknown; employee?: { joiningDate?: string | null; shiftId?: string | null } } | null;
      const savedEmployee = input?.employee ?? {};
      const employee = {
        ...slip.employee,
        joiningDate: Object.hasOwn(savedEmployee, "joiningDate") ? (typeof savedEmployee.joiningDate === "string" ? new Date(savedEmployee.joiningDate) : null) : slip.employee.joiningDate,
        shiftId: Object.hasOwn(savedEmployee, "shiftId") ? (typeof savedEmployee.shiftId === "string" ? savedEmployee.shiftId : null) : slip.employee.shiftId,
      };
      const current = await attendanceSummary(tenantId, employee, month, true, tx);
      return attendanceChanged(input?.attendance, current) ? `${slip.employee.firstName} ${slip.employee.lastName}: attendance or leave changed. Regenerate this draft payslip before review.` : null;
    }));
    errors.push(...results.filter((message): message is string => Boolean(message)));
  }
  return errors;
}
