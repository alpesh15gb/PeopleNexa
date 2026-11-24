import { isMonthKey } from "./dates";

const payrollStages = ["inputs", "adjustments", "review", "payment"] as const;
type PayrollStage = typeof payrollStages[number];

export type PayrollReviewScope = {
  locationId: string;
  period: string;
  runId?: string;
  stage: PayrollStage;
  view?: "missing-salaries";
  page?: number;
};

export function payrollReviewParams(scope: PayrollReviewScope) {
  const params: Record<string, string> = { payLocation: scope.locationId, payPeriod: scope.period, payStage: scope.stage };
  if (scope.runId) params.payRun = scope.runId;
  if (scope.view) params.payView = scope.view;
  if (scope.page && scope.view) params.payPage = String(scope.page);
  return params;
}

export function payrollReviewReturn(query: Record<string, string | string[] | undefined>) {
  const { payLocation, payPeriod, payStage, payRun, payView, payPage } = query;
  const id = /^[A-Za-z0-9_-]{1,120}$/;
  if (typeof payLocation !== "string" || !id.test(payLocation) || typeof payPeriod !== "string" || !isMonthKey(payPeriod)) return null;
  const stage = payrollStages.find(value => value === payStage);
  if (!stage || (payRun !== undefined && (typeof payRun !== "string" || !id.test(payRun)))) return null;
  const view = payView === "missing-salaries" ? payView : undefined;
  if (payView !== undefined && !view) return null;
  const page = typeof payPage === "string" && /^[1-9][0-9]{0,5}$/.test(payPage) ? Number(payPage) : undefined;
  const params = new URLSearchParams({ location: payLocation, period: payPeriod, stage });
  if (payRun) params.set("run", payRun);
  if (view) params.set("view", view);
  if (view && page) params.set("page", String(page));
  return {
    href: `/admin/payroll?${params}`,
    params: payrollReviewParams({ locationId: payLocation, period: payPeriod, stage, runId: payRun, view, page }),
  };
}
