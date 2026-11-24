import type { PayrollIssue } from "./payroll-issue";
import type { Prisma } from "@/generated/prisma/client";
import { attendanceSummary, monthRange, snapshottedPayrollWeeklyOffDates, splitAdjustments, type PayrollAdjustmentInput } from "./payroll";
import { resolveManualPayrollSource, manualUploadId, ManualPayrollError } from "./payroll-manual-source";

const fields = ["presentDays", "lateDays", "halfDays", "absentDays", "onLeaveDays", "paidLeaveDays", "unpaidLeaveDays", "overtimeHours", "workingDays", "workedHours", "halfDaysWorkedOnWeeklyOff"] as const;
export function attendanceChanged(saved: unknown, current: unknown) {
  if (!saved || typeof saved !== "object" || !current || typeof current !== "object") return true;
  const a = saved as Record<string, unknown>, b = current as Record<string, unknown>;
  return fields.some((key) => {
    const old = a[key] ?? 0, next = b[key] ?? 0;
    return typeof old !== "number" || typeof next !== "number" || !Number.isFinite(old) || !Number.isFinite(next) || Math.abs(old - next) > 0.000001;
  }) || Boolean(a.legacyLeavePayWarning) !== Boolean(b.legacyLeavePayWarning);
}

export function payrollAdjustmentsChanged(snapshot: { adjustmentInputs?: unknown; result?: { adjustments?: unknown } } | null, current: PayrollAdjustmentInput[]) {
  if (Array.isArray(snapshot?.adjustmentInputs)) {
    const key = ({ id, type, label, amount }: PayrollAdjustmentInput) => JSON.stringify([id, type, label, amount]);
    return JSON.stringify(snapshot.adjustmentInputs.map(key).sort()) !== JSON.stringify(current.map(key).sort());
  }
  // Older drafts recorded the calculated labels and amounts without adjustment IDs.
  const saved = Array.isArray(snapshot?.result?.adjustments) ? snapshot.result.adjustments : [];
  const line = ({ label, amount }: { label: string; amount: number }) => JSON.stringify([label, amount]);
  return JSON.stringify(saved.map(line).sort()) !== JSON.stringify(splitAdjustments(current).list.map(line).sort());
}

type SourcePayslip = { employeeId: string; inputSnapshot: unknown; employee: { id: string; shiftId: string | null; joiningDate: Date | null; firstName: string; lastName: string } };

export async function payrollSourceReview(tx: Prisma.TransactionClient, tenantId: string, month: string, slips: SourcePayslip[]) {
  return (await payrollSourceIssues(tx, tenantId, month, slips)).map(issue => issue.message);
}

export async function payrollSourceIssues(tx: Prisma.TransactionClient, tenantId: string, month: string, slips: SourcePayslip[]): Promise<PayrollIssue[]> {
  const { start, end } = monthRange(month);
  const unresolved = await tx.leaveRequest.count({ where: { tenantId, employeeId: { in: slips.map((slip) => slip.employeeId) }, fromDate: { lt: end }, toDate: { gte: start }, OR: [{ status: "pending" }, { status: "approved", cancellationRequestedBy: { not: null } }] } });
  if (unresolved) return [{ code: "pending-leave", message: `Resolve ${unresolved} pending leave or cancellation decision(s) for this payroll month before review.` }];
  const errors: PayrollIssue[] = [];
  const uploadIds = [...new Set(slips.map(slip => manualUploadId(slip.inputSnapshot)).filter((id): id is string => Boolean(id)))];
  if (uploadIds.length > 1 || (uploadIds.length && slips.some(slip => !manualUploadId(slip.inputSnapshot)))) return [{ code: "mixed-source", message: "A payroll run must use one attendance source." }];
  if (uploadIds.length) {
    const upload = await tx.payrollAttendanceImport.findFirst({ where: { id: uploadIds[0], tenantId, month, reviewedAt: { not: null } }, select: { reviewedRows: true } });
    const included = (upload?.reviewedRows as unknown as Array<{ employeeId: string | null; excluded: boolean }> | null)?.filter(row => !row.excluded) ?? [];
    const missing = included.filter(row => !slips.some(slip => slip.employeeId === row.employeeId));
    if (missing.length) return [{ code: "workbook-members", message: `Generate the ${missing.length} remaining included employee(s) from this attendance upload before review.` }];
  }
  const adjustments = slips.length ? await tx.payrollAdjustment.findMany({
    where: { tenantId, month, employeeId: { in: slips.map((slip) => slip.employeeId) } },
    select: { id: true, employeeId: true, type: true, label: true, amount: true },
  }) : [];
  const adjustmentsByEmployee = Map.groupBy(adjustments, (adjustment) => adjustment.employeeId);
  // A bounded batch avoids hundreds of concurrent database queries.
  for (let index = 0; index < slips.length; index += 4) {
    const results = await Promise.all(slips.slice(index, index + 4).map(async (slip): Promise<PayrollIssue | null> => {
      const input = slip.inputSnapshot as {
        attendance?: unknown;
        adjustmentInputs?: unknown;
        result?: { adjustments?: unknown };
        employee?: { joiningDate?: string | null; shiftId?: string | null };
      } | null;
      const employeeName = `${slip.employee.firstName} ${slip.employee.lastName}`;
      if (payrollAdjustmentsChanged(input, adjustmentsByEmployee.get(slip.employeeId) ?? [])) {
        return { code: "adjustments-changed", employeeId: slip.employeeId, message: `${employeeName}: payroll adjustments changed. Regenerate this draft payslip before review.` };
      }
      const savedEmployee = input?.employee ?? {};
      const employee = {
        ...slip.employee,
        joiningDate: Object.hasOwn(savedEmployee, "joiningDate") ? (typeof savedEmployee.joiningDate === "string" ? new Date(savedEmployee.joiningDate) : null) : slip.employee.joiningDate,
        shiftId: Object.hasOwn(savedEmployee, "shiftId") ? (typeof savedEmployee.shiftId === "string" ? savedEmployee.shiftId : null) : slip.employee.shiftId,
      };
      const uploadId = manualUploadId(slip.inputSnapshot);
      const upload = uploadId ? await tx.payrollAttendanceImport.findFirst({ where: { id: uploadId, tenantId, month }, select: { locationId: true } }) : null;
      let current;
      try {
        current = uploadId
          ? (await resolveManualPayrollSource(tx, tenantId, upload?.locationId, month, uploadId, employee.id)).summary
          : await attendanceSummary(tenantId, employee, month, true, tx, snapshottedPayrollWeeklyOffDates(input?.attendance));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error instanceof ManualPayrollError || error.message.startsWith("Leave snapshot has no valid day fraction")) {
          return { code: "source-invalid", employeeId: slip.employeeId, message: `${employeeName}: ${error.message}` };
        }
        if (error.message.startsWith(`Payroll blocked for employee ${employee.id}: `)) {
          return { code: "source-invalid", employeeId: slip.employeeId, message: `${employeeName}: ${error.message.split(": ", 2)[1]}` };
        }
        throw error;
      }
      return attendanceChanged(input?.attendance, current) ? { code: "attendance-changed", employeeId: slip.employeeId, message: `${employeeName}: attendance or leave changed. Regenerate this draft payslip before review.` } : null;
    }));
    errors.push(...results.filter((issue): issue is PayrollIssue => issue !== null));
  }
  return errors;
}
