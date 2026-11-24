import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { payrollReviewParams, type PayrollReviewScope } from "@/lib/payroll-review-links";

export type PayrollReadinessItem = {
  id: string;
  name: string;
  employeeNumber: string;
  employeeId: string;
  branchId?: string | null;
  date?: string;
  endDate?: string;
  canAct: boolean;
  cancellation?: boolean;
};

export type PayrollReadiness = {
  corrections: PayrollReadinessItem[];
  leaves: PayrollReadinessItem[];
  bank: PayrollReadinessItem[];
  pan: PayrollReadinessItem[];
  pendingCorrections: number;
  pendingLeaves: number;
  missingBank: number;
  missingPan: number;
};

export function payrollEmployeeFixHref(scope: PayrollReviewScope, employeeId: string, field: "bank" | "pan" | "salary" | "joining") {
  const params = new URLSearchParams({ ...payrollReviewParams(scope), employee: employeeId, section: field === "joining" ? "overview" : "job" });
  if (field !== "joining") params.set("payField", field);
  return `/admin/employee-master?${params}`;
}

export function ReadinessSummary({ readiness, scope, children }: { readiness: PayrollReadiness; scope: PayrollReviewScope; children?: ReactNode }) {
  const entries = [
    { key: "leaves", label: "Pending leave and cancellations", count: readiness.pendingLeaves, items: readiness.leaves, kind: scope.runId ? "Blocks review" : "Check before review" },
    { key: "corrections", label: "Pending attendance corrections", count: readiness.pendingCorrections, items: readiness.corrections, kind: "Review item" },
    { key: "bank", label: "Missing bank details", count: readiness.missingBank, items: readiness.bank, kind: "Bank export" },
    { key: "pan", label: "Missing PAN with TDS enabled", count: readiness.missingPan, items: readiness.pan, kind: "Review item" },
  ] as const;
  const visible = entries.filter(({ count }) => count > 0);
  if (!visible.length) return null;

  return (
    <section id="payroll-cohort-checks" aria-labelledby="payroll-readiness-title" className="scroll-mt-24 rounded-xl border border-edge bg-card p-4 sm:p-5">
      <h3 id="payroll-readiness-title" className="font-semibold">{scope.runId ? "Requests affecting this run" : "Check before creating the draft"}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{scope.runId ? "These checks cover the employees with payslips in this run." : "These checks cover all eligible employees in the selected location and month."}</p>
      <div className="mt-3 divide-y divide-edge">
        {visible.map(({ key, label, count, kind, items }) => (
          <details key={key} open={key === "leaves" && Boolean(scope.runId)} className="py-2">
            <summary className="cursor-pointer rounded-md px-1 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              <span>{label} ({count})</span> <Badge tone={kind === "Blocks review" ? "danger" : "warning"}>{kind}</Badge>
            </summary>
            <ul className="mt-2 divide-y divide-edge rounded-lg border border-edge">
              {items.map(item => {
                const params = new URLSearchParams(payrollReviewParams(scope));
                if (item.branchId) params.set("branch", item.branchId);
                let href: string;
                let action: string;
                if (key === "leaves") {
                  params.set("status", "needs_review");
                  params.set("q", item.employeeNumber);
                  params.set("item", `leave.${item.id}`);
                  href = `/admin/leaves?${params}`;
                  action = item.cancellation ? "Review cancellation" : "Review leave";
                } else if (key === "corrections") {
                  params.set("view", "corrections");
                  params.set("item", `correction.${item.id}`);
                  if (item.date) params.set("date", item.date);
                  href = `/admin/regularization?${params}`;
                  action = "Review correction";
                } else {
                  href = payrollEmployeeFixHref(scope, item.employeeId, key);
                  action = key === "bank" ? "Add bank details" : "Add PAN";
                }
                return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 break-words"><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.employeeNumber}{item.date ? ` · ${item.date}` : ""}{item.endDate && item.endDate !== item.date ? ` to ${item.endDate}` : ""}</p></div>
                  {item.canAct ? <Link href={href} className="inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4">{action} <span className="sr-only">{item.name}</span></Link>
                    : <span className="text-xs text-muted-foreground">{key === "leaves" || key === "corrections" ? "Ask an eligible reviewer to decide" : "Ask a payroll administrator"}</span>}
                </li>;
              })}
            </ul>
            {count > items.length && <p className="mt-2 text-xs text-muted-foreground">Showing {items.length} of {count}. Reopen payroll after resolving these to see the next items.</p>}
          </details>
        ))}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
