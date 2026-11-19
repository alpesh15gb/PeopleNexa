"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isMonthKey } from "@/lib/dates";
import type { PayrollScheduleComparison, PayrollScheduleTotals } from "@/lib/payroll-schedule-comparison";

const metrics = [
  ["Working days", "workingDays"],
  ["Absent days", "absentDays"],
  ["Unpaid attendance days", "unpaidDays"],
] as const satisfies ReadonlyArray<readonly [string, keyof PayrollScheduleTotals]>;

export function PayrollScheduleComparisonPanel({ locations, effectiveMonth, selectedLocationId }: {
  locations: { id: string; name: string }[];
  effectiveMonth: string;
  selectedLocationId: string | null;
}) {
  const [locationId, setLocationId] = useState(selectedLocationId ?? locations[0]?.id ?? "");
  const [month, setMonth] = useState(effectiveMonth);
  const [result, setResult] = useState<PayrollScheduleComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationId || !isMonthKey(month)) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/payroll/schedule-comparison?${new URLSearchParams({ locationId, month })}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error ?? "Could not compare payroll attendance.");
      setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not compare payroll attendance.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-lg border border-edge p-4">
      <summary className="cursor-pointer text-sm font-semibold">Compare weekly-off treatment</summary>
      <p className="my-3 text-sm text-muted-foreground">
        Compare current attendance and leave for eligible staff using both methods. This preview uses the current shift assignments and dated rosters. It shows attendance days before salary or deduction rules are applied.
      </p>
      <form onSubmit={compare} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Comparison location">
          <Select value={locationId} disabled={busy} onChange={(event) => { setLocationId(event.target.value); setResult(null); setError(""); }}>
            <option value="" disabled>Choose location</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </Select>
        </Field>
        <Field label="Comparison month">
          <Input type="month" value={month} disabled={busy} onChange={(event) => { setMonth(event.target.value); setResult(null); setError(""); }} />
        </Field>
        <Button type="submit" variant="outline" loading={busy} disabled={busy || !locationId || !isMonthKey(month)}>Compare attendance</Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          <p role="status">
            {result.compared.toLocaleString()} compared · {result.affected.length.toLocaleString()} affected · {result.needsReview.length.toLocaleString()} need review.
            {" "}The effective policy uses {result.liveUsesShiftWeeklyOffs ? "shift weekly offs" : "legacy attendance"} for new payroll drafts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-edge"><th scope="col" className="p-2">Total</th><th scope="col" className="p-2">Legacy</th><th scope="col" className="p-2">Shift weekly offs</th><th scope="col" className="p-2">Change</th></tr></thead>
              <tbody>
                {metrics.map(([label, key]) => (
                  <tr key={key} className="border-b border-edge">
                    <th scope="row" className="p-2 font-medium">{label}</th>
                    <td className="p-2 tabular-nums">{result.legacy[key].toLocaleString()}</td>
                    <td className="p-2 tabular-nums">{result.shiftBased[key].toLocaleString()}</td>
                    <td className="p-2 tabular-nums">{(result.shiftBased[key] - result.legacy[key]).toLocaleString(undefined, { signDisplay: "exceptZero" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.affected.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Affected employees</summary>
              <ul className="mt-2 max-h-56 space-y-2 overflow-auto">
                {result.affected.map((employee) => (
                  <li key={employee.employeeNumber}>
                    <strong>{employee.employeeName} ({employee.employeeNumber})</strong>
                    <span className="block text-muted-foreground">{employee.legacy.unpaidDays} → {employee.shiftBased.unpaidDays} unpaid attendance days · {employee.legacy.workingDays} → {employee.shiftBased.workingDays} working days</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.needsReview.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Employees needing review</summary>
              <ul className="mt-2 max-h-56 space-y-2 overflow-auto">
                {result.needsReview.map((employee) => <li key={employee.employeeNumber}>{employee.employeeName} ({employee.employeeNumber}) · {employee.reason}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
