export const PAYROLL_RUN_STATUSES = ["draft", "reviewed", "approved", "finalized", "paid", "cancelled", "reversed"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

const transitions: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft: ["reviewed", "cancelled"],
  reviewed: ["approved", "cancelled"],
  approved: ["finalized", "cancelled"],
  finalized: ["paid"],
  paid: ["reversed"],
  cancelled: [],
  reversed: [],
};

export function canTransitionPayrollRun(from: string, to: string): boolean {
  return (transitions[from as PayrollRunStatus] ?? []).includes(to as PayrollRunStatus);
}

export function payrollRunTransitionData(status: PayrollRunStatus, actorId: string) {
  const at = new Date();
  if (status === "reviewed") return { status, reviewedBy: actorId, reviewedAt: at };
  if (status === "approved") return { status, approvedBy: actorId, approvedAt: at };
  if (status === "finalized") return { status, finalizedBy: actorId, finalizedAt: at };
  if (status === "paid") return { status, paidBy: actorId, paidAt: at };
  if (status === "cancelled") return { status, cancelledBy: actorId, cancelledAt: at };
  return { status };
}

/** Intentionally plain data so this can be called inside the transition transaction. */
export function payrollRunAuditData(runId: string, tenantId: string, actorId: string, actorRole: string, from: string, to: string) {
  return {
    tenantId, actorId, actorRole, action: "payroll_run.transition", entity: "PayrollRun", entityId: runId,
    summary: `Payroll run ${from} -> ${to}`, before: { status: from }, after: { status: to },
  };
}

export function paymentEvidence(body: Record<string, unknown>, count: number, net: number) {
  const method = String(body.paymentMethod ?? "").trim().toLowerCase();
  const reference = String(body.paymentReference ?? "").trim();
  const settlement = String(body.settlementDate ?? "").trim();
  const confirmedCount = Number(body.confirmedCount);
  const confirmedNet = Number(body.confirmedNet);
  if (!['cash', 'upi', 'bank', 'other'].includes(method)) return { error: "Payment method is required." } as const;
  if (!reference || reference.length > 120) return { error: "Payment reference or batch ID is required (max 120 characters)." } as const;
  const settlementDate = new Date(settlement);
  if (!settlement || Number.isNaN(settlementDate.getTime())) return { error: "A valid settlement date is required." } as const;
  if (!Number.isInteger(confirmedCount) || confirmedCount !== count) return { error: `Confirm the exact payslip count (${count}).` } as const;
  if (!Number.isFinite(confirmedNet) || Math.abs(confirmedNet - net) > 0.005) return { error: `Confirm the exact net total (${net.toFixed(2)}).` } as const;
  return { value: { paymentMethod: method, paymentReference: reference, settlementDate, paymentConfirmedCount: confirmedCount, paymentConfirmedNet: confirmedNet } } as const;
}
