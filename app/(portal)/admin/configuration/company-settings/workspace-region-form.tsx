"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatRegionalMoney, supportsIndiaPayroll, type WorkspaceRegion } from "@/lib/workspace-region";

export function WorkspaceRegionForm({ initial, hasAttendance }: { initial: WorkspaceRegion; hasAttendance: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [region, setRegion] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isDirty = region.countryCode !== saved.countryCode || region.currency !== saved.currency || region.locale !== saved.locale || region.timeZone !== saved.timeZone;

  function edit(field: keyof WorkspaceRegion, value: string) {
    setError("");
    setRegion((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings/workspace-region", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(region) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.region) throw new Error(data?.error ?? "Could not save regional settings.");
      setRegion(data.region);
      setSaved(data.region);
      toast("success", "Regional settings saved.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save regional settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="regional-settings" aria-labelledby="regional-settings-title" className="scroll-mt-24 rounded-2xl border border-edge bg-card p-5">
      <h2 id="regional-settings-title" className="font-display text-lg font-semibold">Region and time zone</h2>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Country code" hint="Two-letter code, such as IN, GB or US">
            <Input required minLength={2} maxLength={2} value={region.countryCode} onChange={(event) => edit("countryCode", event.target.value.toUpperCase())} />
          </Field>
          <Field label="Currency code" hint="For example INR, GBP or USD">
            <Input required minLength={3} maxLength={3} value={region.currency} onChange={(event) => edit("currency", event.target.value.toUpperCase())} />
          </Field>
          <Field label="Formatting locale" hint="For example en-IN, en-GB or fr-CA">
            <Input required maxLength={60} value={region.locale} onChange={(event) => edit("locale", event.target.value)} />
          </Field>
          <Field label="Attendance time zone" hint={hasAttendance ? "Attendance history locks this setting." : "IANA name, such as Europe/London"}>
            <Input required disabled={hasAttendance} maxLength={100} value={region.timeZone} onChange={(event) => edit("timeZone", event.target.value)} />
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Current currency format {formatRegionalMoney(1234.5, saved)}</p>
            <p>{supportsIndiaPayroll(saved) ? "India payroll formats are available. Verify statutory policy and filing inputs for each establishment and pay period." : "Use a local payroll provider for statutory calculation and filing in this region."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDirty && <Button type="button" variant="ghost" disabled={saving} onClick={() => { setRegion(saved); setError(""); }}>Reset</Button>}
            <Button type="submit" disabled={!isDirty} loading={saving}>Save regional settings</Button>
          </div>
        </div>
      </form>
    </section>
  );
}
