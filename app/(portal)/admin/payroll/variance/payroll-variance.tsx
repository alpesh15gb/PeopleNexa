"use client";

import Link from "next/link";
import { payrollScopeHref } from "@/lib/payroll-work-queue";
import { useState } from "react";
import { FileWarning, Search } from "lucide-react";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

type Comparison = {
  totals: { grossDelta: number; deductionsDelta: number; netDelta: number };
  rows: {
    employeeId: string;
    name: string;
    grossDelta: number;
    deductionsDelta: number;
    netDelta: number;
  }[];
};
type Props = {
  reference: string;
  current: string;
  locationId: string | null;
  locations: { id: string; name: string }[];
  referenceRun: { status: string; count: number; id?: string } | null;
  currentRun: { status: string; count: number; id?: string } | null;
  comparison: Comparison | null;
  canManageSettings?: boolean;
};

export function PayrollVariance({
  reference,
  current,
  locationId,
  locations,
  referenceRun,
  currentRun,
  comparison,
  canManageSettings = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const rows =
    comparison?.rows.filter(
      (row) =>
        row.name.toLowerCase().includes(search.toLowerCase().trim()) &&
        (!changedOnly ||
          row.grossDelta !== 0 ||
          row.deductionsDelta !== 0 ||
          row.netDelta !== 0),
    ) ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="History & reports" description="Compare completed payroll for two months in the same location." />
      <PayrollNavigation
        active="history"
        canManageSettings={canManageSettings}
        locationId={locationId}
        period={current}
      />
      <form key={`${locationId}:${reference}:${current}`} action="/admin/payroll/variance"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-card p-4">
        {canManageSettings ? (
          <Field label="Location" className="min-w-36 flex-1">
            <Select name="location" defaultValue={locationId ?? ""} required>
              <option value="" disabled>Select location</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
          </Field>
        ) : (
          <div className="min-w-36 flex-1">
            <p className="text-sm font-medium">Location</p>
            <p className="mt-1 flex min-h-11 items-center break-words text-sm">{locations.find((location) => location.id === locationId)?.name ?? "No active location"}</p>
          </div>
        )}
        <Field label="Compare from" className="min-w-36 flex-1">
          <Input name="reference" type="month" defaultValue={reference} required />
        </Field>
        <Field label="Compare to" className="min-w-36 flex-1">
          <Input name="current" type="month" defaultValue={current} required />
        </Field>
        <Button type="submit" disabled={!locations.length}>Compare payroll</Button>
        <p className="w-full text-xs text-muted-foreground">Includes finalized and paid payroll across all eligible runs in each month.</p>
      </form>
      {locationId && (referenceRun || currentRun) && <section aria-label="Recorded payroll periods" className="grid gap-3 sm:grid-cols-2">
        {([{ label: "Reference month", period: reference, run: referenceRun }, { label: "Comparison month", period: current, run: currentRun }]).map(({ label, period, run }) => (
          <div key={label} className="rounded-xl border border-edge bg-card p-4">
            <h2 className="text-sm font-semibold">{label} · {period}</h2>
            {run ? <><p className="mt-1 text-sm text-muted-foreground">{run.count} {run.count === 1 ? "payslip" : "payslips"}</p>
              <Link href={payrollScopeHref("/admin/payroll", { locationId, period, runId: run.id })} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Open {period} payroll</Link></>
              : <p className="mt-1 text-sm text-muted-foreground">No completed payroll</p>}
          </div>
        ))}
      </section>}
      {!comparison ? (
        <section className="flex gap-4 rounded-2xl border border-dashed border-edge p-8">
          <FileWarning
            aria-hidden="true"
            className="h-6 w-6 shrink-0 text-muted-foreground"
          />
          <div>
            <h2 className="font-semibold">
              Choose two months with completed payroll
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {!locationId
                ? "Select a location to get started."
                : reference === current
                  ? "Select a different comparison month."
                  : !referenceRun && !currentRun
                  ? "Neither selected month has completed payroll."
                  : !referenceRun
                    ? "The first month has no completed payroll."
                    : "The second month has no completed payroll."}
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Gross pay change"
              value={signed(comparison.totals.grossDelta)}
            />
            <Metric
              label="Deductions change"
              value={signed(comparison.totals.deductionsDelta)}
            />
            <Metric
              label="Net pay change"
              value={signed(comparison.totals.netDelta)}
            />
            <Metric
              label="Employees compared"
              value={String(comparison.rows.length)}
            />
          </section>
          <section className="overflow-hidden rounded-2xl border border-edge bg-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge p-5">
              <div>
                <h2 className="font-semibold">Changes by employee</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Positive amounts increased from {reference} to {current}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                  />
                  <Input
                    aria-label="Search employees"
                    placeholder="Search employees"
                    className="pl-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={changedOnly}
                    onChange={(event) => setChangedOnly(event.target.checked)}
                  />
                  Changes only
                </label>
              </div>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-tint text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left">Employee</th>
                    <th className="px-5 py-3 text-right">Gross change</th>
                    <th className="px-5 py-3 text-right">Deductions change</th>
                    <th className="px-5 py-3 text-right">Net pay change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {rows.map((row) => (
                    <tr key={row.employeeId}>
                      <td className="px-5 py-4 font-medium">{row.name}</td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        {signed(row.grossDelta)}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums">
                        {signed(row.deductionsDelta)}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold tabular-nums">
                        {signed(row.netDelta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-edge md:hidden">
              {rows.map((row) => (
                <article key={row.employeeId} className="p-5">
                  <h3 className="font-semibold">{row.name}</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt>Gross change</dt>
                      <dd>{signed(row.grossDelta)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Deductions change</dt>
                      <dd>{signed(row.deductionsDelta)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>Net pay change</dt>
                      <dd>{signed(row.netDelta)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            {!rows.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No employees match these filters.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-edge bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}
