"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileWarning, Search } from "lucide-react";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  referenceRun: { status: string; count: number } | null;
  currentRun: { status: string; count: number } | null;
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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  function change(
    next: Partial<{ reference: string; current: string; location: string }>,
  ) {
    const query = new URLSearchParams({
      reference: next.reference ?? reference,
      current: next.current ?? current,
    });
    const location = next.location ?? locationId;
    if (location) query.set("location", location);
    router.push(`/admin/payroll/variance?${query}`);
  }
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
    <main className="mx-auto max-w-6xl space-y-5 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Pay & people
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          History & reports
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare completed payroll between two months to understand changes in
          pay.
        </p>
      </header>
      <PayrollNavigation
        active="history"
        canManageSettings={canManageSettings}
      />
      <section className="grid gap-4 rounded-2xl border border-edge bg-card p-5 sm:grid-cols-3">
        <Field label="Location">
          <Select
            value={locationId ?? ""}
            disabled={!canManageSettings}
            onChange={(event) => change({ location: event.target.value })}
          >
            <option value="" disabled>
              Select location
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Compare from">
          <Input
            type="month"
            value={reference}
            onChange={(event) => {
              if (event.target.value) change({ reference: event.target.value });
            }}
          />
        </Field>
        <Field label="Compare to">
          <Input
            type="month"
            value={current}
            onChange={(event) => {
              if (event.target.value) change({ current: event.target.value });
            }}
          />
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Includes finalized and paid payroll, including multiple runs in each
          month.
        </p>
      </section>
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
    </main>
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
