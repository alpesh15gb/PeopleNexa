import type { Prisma } from "@/generated/prisma/client";
import { istDateKey } from "./ist";

export async function assertLeavePayrollOpen(tx: Prisma.TransactionClient, tenantId: string, employeeId: string, from: Date, to: Date) {
  const run = await tx.payrollRun.findFirst({
    where: {
      tenantId,
      month: { gte: istDateKey(from).slice(0, 7), lte: istDateKey(to).slice(0, 7) },
      status: { in: ["reviewed", "approved", "finalized", "paid"] },
      OR: [{ members: { some: { employeeId } } }, { payslips: { some: { employeeId } } }],
    },
    select: { month: true, status: true },
  });
  if (run) throw Object.assign(new Error(`Payroll for ${run.month} is ${run.status}. Reopen an eligible run before changing leave; finalized or paid payroll requires a separately reviewed adjustment.`), { code: "PAYROLL_LOCKED" });
}
