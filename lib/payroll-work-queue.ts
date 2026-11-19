export const PAYROLL_QUEUE_STAGES = {
  draft: { label: "Drafts to review", statusLabel: "Draft", action: "Open draft" },
  reviewed: { label: "Awaiting approval", statusLabel: "Reviewed", action: "Open for approval" },
  approved: { label: "Approved to finalize", statusLabel: "Approved", action: "Open for finalization" },
  finalized: { label: "Awaiting payment", statusLabel: "Finalized", action: "Open for payment" },
} as const;

export type PayrollQueueStage = keyof typeof PAYROLL_QUEUE_STAGES;
export const payrollQueueStages = Object.keys(PAYROLL_QUEUE_STAGES) as PayrollQueueStage[];

export function payrollQueueStage(status: string | undefined): PayrollQueueStage | null {
  return payrollQueueStages.find((stage) => stage === status) ?? null;
}

export function payrollScopeHref(path: string, scope: { locationId?: string | null; period?: string | null; runId?: string; stage?: PayrollQueueStage | null } = {}) {
  const params = new URLSearchParams();
  if (scope.locationId) params.set("location", scope.locationId);
  if (scope.period) params.set(path === "/admin/payroll/variance" ? "current" : "period", scope.period);
  if (scope.runId) params.set("run", scope.runId);
  if (scope.stage) params.set("stage", scope.stage);
  return params.size ? `${path}?${params}` : path;
}

export function canApprovePayrollRun(createdBy: string, actorId: string) {
  return createdBy !== actorId;
}
