import type { Prisma } from "@/generated/prisma/client";
import { round2 } from "./utils";

export const EXPENSE_REIMBURSEMENT_PREFIX = "Expense reimbursement ";

export async function hasPaidExpenseReimbursement(tx: Prisma.TransactionClient, claim: { id: string; tenantId: string; employeeId: string; amount: number }) {
  const scope = { tenantId: claim.tenantId, employeeId: claim.employeeId };
  const canonicalLabel = EXPENSE_REIMBURSEMENT_PREFIX + claim.id;
  const historicalLabel = EXPENSE_REIMBURSEMENT_PREFIX + claim.id.slice(0, 8);
  const candidates = await tx.payrollAdjustment.findMany({
    where: { ...scope, type: "other", label: { in: [canonicalLabel, historicalLabel] } },
    select: { id: true, month: true, label: true, amount: true },
  });
  const exact = candidates.filter((candidate) => candidate.label === canonicalLabel);
  const matching = exact.length ? exact : candidates;
  if (matching.length !== 1) return false;
  const adjustment = matching[0];
  if (round2(adjustment.amount) !== round2(claim.amount)) return false;
  if (!exact.length && await tx.expenseClaim.count({ where: { ...scope, id: { startsWith: claim.id.slice(0, 8) }, status: { in: ["approved", "settled"] } } }) !== 1) return false;

  const slips = await tx.payslip.findMany({
    where: { ...scope, month: adjustment.month, status: "paid", OR: [{ payrollRunId: null }, { payrollRun: { status: "paid" } }] },
    select: { inputSnapshot: true, adjustments: true },
  });
  return slips.some((slip) => {
    const snapshot = slip.inputSnapshot as { adjustmentInputs?: { id: string }[] } | null;
    if (Array.isArray(snapshot?.adjustmentInputs)) return snapshot.adjustmentInputs.some((item) => item.id === adjustment.id);
    const lines = slip.adjustments as { label: string; amount: number }[] | null;
    return Array.isArray(lines) && lines.filter((line) => line.label === adjustment.label && round2(line.amount) === round2(adjustment.amount)).length === 1;
  });
}
