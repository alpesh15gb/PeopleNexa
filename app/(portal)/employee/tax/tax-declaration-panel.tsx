"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";

interface Declaration {
  id: string;
  fy: string;
  sections: Record<string, number>;
  status: string;
  note: string | null;
  updatedAt: string;
}

export function TaxDeclarationPanel({
  currentFy,
  declarations,
}: {
  currentFy: string;
  declarations: Declaration[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existing = declarations.find((d) => d.fy === currentFy);
  const initial = existing?.sections ?? {};
  const verified = existing?.status === "verified";
  const historical = declarations.filter((item) => item.fy !== currentFy);
  const [sections, setSections] = useState({
    "80c": initial["80c"] ?? 0,
    "80d": initial["80d"] ?? 0,
    hra: initial.hra ?? 0,
    lta: initial.lta ?? 0,
    other: initial.other ?? 0,
  });

  const total =
    sections["80c"] +
    sections["80d"] +
    sections.hra +
    sections.lta +
    sections.other;

  const set = (key: keyof typeof sections, v: string) => {
    setSections((s) => ({ ...s, [key]: Math.max(0, Number(v) || 0) }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || verified) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/tax-declarations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy: currentFy, sections }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not submit your declaration.");
      toast(
        "success",
        existing
          ? "Declaration updated — pending HR verification"
          : "Declaration submitted for verification",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm submission. Check your declaration before retrying.");
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = verified ? "Verified" : existing?.status === "rejected" ? "Returned for correction" : existing ? "Awaiting HR review" : "Ready to start";
  const statusTone = verified ? "success" : existing?.status === "rejected" ? "danger" : existing ? "warning" : "neutral";

  return (
    <section aria-labelledby="current-declaration" className="overflow-hidden rounded-xl border border-edge bg-card">
      <div className="border-b border-edge p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="current-declaration" className="font-semibold">Investment declaration</h2>
            <p className="mt-1 text-sm text-muted-foreground">Financial year {currentFy}</p>
          </div>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {verified ? "Ask HR to return the verified declaration if you need to change it."
            : existing?.status === "rejected" ? existing.note || "Review the amounts before resubmitting."
              : existing ? "HR will review these amounts. You can update them while you wait."
                : "Enter the amounts you want HR to review. Share supporting documents through your HR team's submission process."}
        </p>
      </div>
      <form method="post" onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <fieldset disabled={saving || verified} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Declared amounts in rupees</legend>
          <Field label="80C investments and contributions" hint="PF, PPF, ELSS, LIC and tuition payments">
            <Input type="number" min={0} step="0.01" value={sections["80c"]} onChange={(event) => set("80c", event.target.value)} />
          </Field>
          <Field label="80D health insurance premiums">
            <Input type="number" min={0} step="0.01" value={sections["80d"]} onChange={(event) => set("80d", event.target.value)} />
          </Field>
          <Field label="HRA rent paid">
            <Input type="number" min={0} step="0.01" value={sections.hra} onChange={(event) => set("hra", event.target.value)} />
          </Field>
          <Field label="LTA travel allowance">
            <Input type="number" min={0} step="0.01" value={sections.lta} onChange={(event) => set("lta", event.target.value)} />
          </Field>
          <Field label="Other deductions" hint="For example, 80G, 80E or NPS under 80CCD">
            <Input type="number" min={0} step="0.01" value={sections.other} onChange={(event) => set("other", event.target.value)} />
          </Field>
        </fieldset>

        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-4">
          <div>
            <p className="text-sm text-muted-foreground">Total declared</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(total)}</p>
          </div>
          {!verified && <Button type="submit" loading={saving}>
            <Save aria-hidden="true" className="size-4" />
            {existing?.status === "rejected" ? "Resubmit declaration" : existing ? "Update declaration" : "Submit declaration"}
          </Button>}
        </div>
      </form>
      {historical.length > 0 && <details className="border-t border-edge p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-medium">Previous years ({historical.length})</summary>
        <ul className="mt-3 divide-y divide-edge">
          {historical.map(({ id, fy, sections, status }) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{fy}</span>
              {typeof sections.total === "number" && <span className="tabular-nums">{formatMoney(sections.total)}</span>}
              <Badge tone={status === "verified" ? "success" : status === "rejected" ? "danger" : "warning"}>
                {status === "verified" ? "Verified" : status === "rejected" ? "Returned" : "Awaiting HR review"}
              </Badge>
            </li>
          ))}
        </ul>
      </details>}
    </section>
  );
}
