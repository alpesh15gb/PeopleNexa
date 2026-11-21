"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EXPENSE_REIMBURSEMENT_PREFIX } from "@/lib/expense-reimbursement";
import { formatMoney } from "@/lib/utils";

export const PAYROLL_WIZARD_STEPS = [
  { id: "inputs", title: "Check inputs" },
  { id: "adjustments", title: "Adjustments" },
  { id: "review", title: "Variance review" },
  { id: "payment", title: "Finalize & disburse" },
] as const;

export type PayrollWizardStage = typeof PAYROLL_WIZARD_STEPS[number]["id"];
export type PayrollReadiness = { pendingCorrections: number; pendingLeaves: number; missingBank: number; missingPan: number };
export type PayrollAdjustment = { id: string; employeeId: string; type: string; label: string; amount: number };
export type PayrollVarianceEntry = { employeeId: string; employeeNumber: string; name: string; netSalary: number };
export type PayrollStatutoryTotals = { pf: number; esi: number; pt: number; tds: number };

export function ReadinessSummary({ readiness }: { readiness: PayrollReadiness }) {
  const entries = [
    { count: readiness.pendingCorrections, label: "Pending attendance corrections", kind: "Review" },
    { count: readiness.pendingLeaves, label: "Pending leave or cancellation decisions", kind: "Blocker at review" },
    { count: readiness.missingBank, label: "Employees missing bank details", kind: "Warning" },
    { count: readiness.missingPan, label: "Employees missing PAN with TDS enabled", kind: "Warning" },
  ];
  return (
    <section aria-labelledby="payroll-readiness-title" className="rounded-xl border border-edge bg-card p-4 sm:p-5">
      <h3 id="payroll-readiness-title" className="font-semibold">Location readiness</h3>
      <p className="mt-1 text-sm text-muted-foreground">Counts cover eligible employees in this location and month. Check the selected employees after creating the draft.</p>
      <dl className="mt-3 divide-y divide-edge">
        {entries.map(({ count, label, kind }) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <dt>{label}</dt>
            <dd className="flex items-center gap-2"><strong className="tabular-nums">{count}</strong>{count > 0 && <Badge tone={kind.startsWith("Blocker") ? "danger" : "warning"}>{kind}</Badge>}</dd>
          </div>
        ))}
      </dl>
      {readiness.missingBank > 0 && <p className="mt-2 text-xs text-muted-foreground">A bank file needs the bank details captured on the payslip. Other payment methods can still be recorded after settlement.</p>}
    </section>
  );
}

type Payee = PayrollVarianceEntry & { payslipId: string; editable: boolean; recorded: { label: string; amount: number }[] };

export function VariablePay({
  month, payees, adjustments, onRefresh, onBusyChange,
}: {
  month: string;
  payees: Payee[];
  adjustments: PayrollAdjustment[];
  onRefresh: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [employeeId, setEmployeeId] = useState(payees[0]?.employeeId ?? "");
  const [type, setType] = useState("bonus");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsRecalculation, setNeedsRecalculation] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const payee = payees.find((item) => item.employeeId === employeeId) ?? payees[0];
  const items: { id?: string; label: string; amount: number }[] = payee?.editable
    ? adjustments.filter((item) => item.employeeId === payee.employeeId)
    : (payee?.recorded ?? []);
  const reimbursement = (value: string) => value.startsWith(EXPENSE_REIMBURSEMENT_PREFIX);

  async function request(path: string, options: RequestInit) {
    const response = await fetch(path, options);
    if (response.ok) return;
    const result = await response.json().catch(() => null);
    throw new Error(result?.error ?? "This payroll action failed. Refresh before retrying.");
  }

  async function update(change?: { id: string } | { label: string; amount: number; type: string }) {
    if (busy || !payee?.editable || (change && needsRecalculation)) return;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    setError("");
    let saved = !change;
    try {
      if (change && "id" in change) {
        await request(`/api/payroll/adjustments/${encodeURIComponent(change.id)}`, { method: "DELETE" });
        saved = true;
      } else if (change) {
        await request("/api/payroll/adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...change, month, employeeId: payee.employeeId }),
        });
        saved = true;
        setLabel("");
        setAmount("");
      }
      await request(`/api/payroll/${encodeURIComponent(payee.payslipId)}/regenerate`, { method: "POST" });
      setNeedsRecalculation(null);
      setMessage("Draft net pay recalculated.");
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : "Refresh and try again.";
      setError(saved ? `Adjustment saved. Draft net pay still needs recalculation. ${reason}` : reason);
      if (saved) setNeedsRecalculation(payee.employeeId);
    } finally {
      if (saved) onRefresh();
      onBusyChange(false);
      setBusy(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !label.trim()) return;
    void update({ label: label.trim(), amount: type === "deduction" ? -value : value, type });
  }

  return (
    <section className="rounded-xl border border-edge bg-card p-4 sm:p-5" aria-labelledby="variable-pay-title">
      <h3 id="variable-pay-title" className="font-semibold">Adjustments by employee</h3>
      <p className="mt-1 text-sm text-muted-foreground">Save or remove a manual adjustment to recalculate the draft net pay. Manage expense reimbursements in Expenses.</p>
      {!payee ? <p className="mt-3 text-sm text-muted-foreground">Create payslips to add variable pay.</p> : (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <Field label="Employee" className="min-w-48 flex-1">
              <Select aria-label="Adjustment employee" disabled={busy || Boolean(needsRecalculation)} value={payee.employeeId} onChange={(event) => { setEmployeeId(event.target.value); setMessage(""); setError(""); }}>
                {payees.map((item) => <option key={item.employeeId} value={item.employeeId}>{item.name} · {item.employeeNumber}</option>)}
              </Select>
            </Field>
            <p className="rounded-lg bg-tint px-3 py-2 text-sm">Recorded net pay <strong className="ml-1 tabular-nums">{formatMoney(payee.netSalary)}</strong></p>
          </div>
          {items.length ? (
            <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge px-3">
              {items.map((item, index) => <li key={item.id ?? index} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{reimbursement(item.label) ? "Expense reimbursement" : item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(item.amount)}</span>
                  {reimbursement(item.label) ? <Badge tone="neutral">Linked claim</Badge> : item.id && <Button size="sm" variant="ghost" disabled={busy || Boolean(needsRecalculation)} onClick={() => item.id && void update({ id: item.id })}>Remove</Button>}
                </div>
              </li>)}
            </ul>
          ) : <p className="mt-4 text-sm text-muted-foreground">No adjustments for this employee.</p>}
          {payee.editable ? (
            <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-edge pt-4" onSubmit={add}>
              <Field label="Adjustment type">
                <Select aria-label="Adjustment type" value={type} onChange={(event) => setType(event.target.value)} disabled={busy || Boolean(needsRecalculation)}>
                  <option value="bonus">Bonus</option><option value="arrears">Arrears</option><option value="deduction">Deduction</option>
                </Select>
              </Field>
              <Field label="Description" className="min-w-36 flex-1">
                <Input required maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy || Boolean(needsRecalculation)} />
              </Field>
              <Field label="Amount" className="w-32">
                <Input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || Boolean(needsRecalculation)} />
              </Field>
              <Button type="submit" loading={busy && !needsRecalculation} disabled={busy || Boolean(needsRecalculation) || !label.trim() || !amount}>Save adjustment</Button>
            </form>
          ) : <p className="mt-3 text-sm text-muted-foreground">These amounts are from the recorded payslip. Editing requires a recalculable draft in this location.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
          {needsRecalculation && <Button className="mt-3" variant="outline" loading={busy} onClick={() => void update()}>Retry draft recalculation</Button>}
        </>
      )}
    </section>
  );
}

export function ReviewVariance({ referenceMonth, previous, current, statutory }: {
  referenceMonth: string;
  previous: PayrollVarianceEntry[];
  current: PayrollVarianceEntry[];
  statutory: PayrollStatutoryTotals;
}) {
  const [showAll, setShowAll] = useState(false);
  const byId = (items: PayrollVarianceEntry[]) => new Map(items.map<[string, PayrollVarianceEntry]>((item) => [item.employeeId, item]).reverse());
  const before = byId(previous);
  const after = byId(current);
  const changes = Array.from(new Set([...after.keys(), ...before.keys()]), (id) => {
    const past = before.get(id);
    const present = after.get(id);
    const delta = (present?.netSalary ?? 0) - (past?.netSalary ?? 0);
    return { id, employee: (present ?? past)!, past, present, delta, percent: past?.netSalary ? delta / Math.abs(past.netSalary) : null };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  return (
    <section className="space-y-4" aria-label="Variance and statutory review">
      <div className="rounded-xl border border-edge bg-card p-4 sm:p-5">
        <h3 className="font-semibold">Statutory deductions in this run</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Employee PF", statutory.pf], ["Employee ESI", statutory.esi], ["Professional tax", statutory.pt], ["TDS", statutory.tds]].map(([label, value]) => (
            <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{formatMoney(Number(value))}</dd></div>
          ))}
        </dl>
      </div>
      <div className="rounded-xl border border-edge bg-card p-4 sm:p-5">
        <h3 className="font-semibold">Net pay compared with {referenceMonth}</h3>
        {!previous.length ? <p className="mt-2 text-sm text-muted-foreground">No completed payroll in this location for {referenceMonth}.</p> : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Previous amounts come from completed payroll. Changes are sorted by the size of the difference.</p>
            <div tabIndex={0} role="region" aria-label="Employee net pay variance" className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead className="border-b border-edge text-xs text-muted-foreground"><tr><th scope="col" className="p-2">Employee</th><th scope="col" className="p-2 text-right">Previous</th><th scope="col" className="p-2 text-right">Current</th><th scope="col" className="p-2 text-right">Change</th></tr></thead>
                <tbody className="divide-y divide-edge">
                  {(showAll ? changes : changes.slice(0, 10)).map(({ id, employee, past, present, delta, percent: rate }) => (
                    <tr key={id}><th scope="row" className="p-2 font-medium">{employee.name}<span className="block text-xs font-normal text-muted-foreground">{employee.employeeNumber}</span></th>
                      <td className="p-2 text-right tabular-nums">{past ? formatMoney(past.netSalary) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{present ? formatMoney(present.netSalary) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{delta > 0 && "+"}{formatMoney(delta)}<span className="block text-xs text-muted-foreground">{!past ? "Added" : !present ? "Outside this run" : rate !== null ? percent.format(rate) : "Previous net zero"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {changes.length > 10 && <Button className="mt-2" size="sm" variant="ghost" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 10" : `Show all ${changes.length} employees`}</Button>}
          </>
        )}
      </div>
    </section>
  );
}
