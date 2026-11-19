import type { Prisma } from "@/generated/prisma/client";
import { FINANCIAL_HISTORY_RUN_STATUSES } from "./payroll-reporting";

export function personalPayslipWhere(tenantId: string, employeeId: string, includeReversed = true): Prisma.PayslipWhereInput {
  const runStatuses = [...FINANCIAL_HISTORY_RUN_STATUSES, ...(includeReversed ? ["reversed"] : [])];
  return {
    tenantId,
    employeeId,
    status: { in: ["finalized", "paid"] },
    OR: [{ payrollRunId: null }, { payrollRun: { is: { status: { in: runStatuses } } } }],
  };
}

export function personalPayslipStatus(status: string, runStatus: string | undefined) {
  return runStatus === "reversed" ? "reversed" : status;
}
