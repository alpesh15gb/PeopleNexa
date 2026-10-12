import type { Prisma } from "@/generated/prisma/client";
import { dayRangeIST } from "./dates";
import { manualUploadId, resolveManualPayrollSource, ManualPayrollError } from "./payroll-manual-source";
import { leavePolicyDraft } from "./configuration";
import { isEarnedLeave } from "./leave-balance";

export async function finalizeManualAttendanceCredits(tx: Prisma.TransactionClient, run: { id: string; tenantId: string; locationId: string | null; month: string; payslips: Array<{ employeeId: string; inputSnapshot: unknown }> }) {
  for (const slip of run.payslips) {
    const uploadId = manualUploadId(slip.inputSnapshot);
    if (!uploadId) continue;
    const source = await resolveManualPayrollSource(tx, run.tenantId, run.locationId, run.month, uploadId, slip.employeeId);
    if (source.earnedLeave > 0) {
      const allocations = await tx.leavePolicyBalance.findMany({ where: { tenantId: run.tenantId, employeeId: slip.employeeId, policyPeriod: { effectiveFrom: { lte: new Date(`${run.month}-01T12:00:00Z`) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${run.month}-01T12:00:00Z`) } }], AND: [{ OR: [{ locationId: null }, { locationId: run.locationId }] }] } }, select: { policySnapshot: true } });
      const ready = allocations.some(allocation => {
        const snapshot = allocation.policySnapshot as { rules?: unknown } | null;
        const rule = leavePolicyDraft({ leaveTypes: [snapshot?.rules] })?.leaveTypes[0];
        return rule?.workedDayAccrual && isEarnedLeave(rule.code, rule.name);
      });
      if (!ready) throw new ManualPayrollError(`Assign a worked-day earned-leave policy period to ${source.sourceCode} for ${run.month} before finalization. Attendance-earned credits must have an eligible leave balance.`);
    }
    const key = { tenantId: run.tenantId, employeeId: slip.employeeId, month: run.month };
    const previous = await tx.payrollAttendanceCredit.findUnique({ where: { tenantId_employeeId_month: key } });
    if (previous?.active && previous.payrollRunId !== run.id) throw new ManualPayrollError("Earned leave is already credited by another finalized run for this employee and month.");
    const data = { payrollRunId: run.id, uploadId, workedDays: source.summary.presentDays, earnedDays: source.earnedLeave, availableOn: dayRangeIST(`${source.availableMonth}-01`).start, active: true };
    await tx.payrollAttendanceCredit.upsert({ where: { tenantId_employeeId_month: key }, create: { ...key, ...data }, update: data });
  }
}
