"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Save, ShieldCheck } from "lucide-react";
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
  monthlySalary,
  name,
}: {
  currentFy: string;
  declarations: Declaration[];
  monthlySalary: number;
  name: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const existing = declarations.find((d) => d.fy === currentFy);
  const initial = existing?.sections ?? {};
  const [sections, setSections] = useState({
    "80c": initial["80c"] ?? 0,
    "80d": initial["80d"] ?? 0,
    hra: initial.hra ?? 0,
    lta: initial.lta ?? 0,
    other: initial.other ?? 0,
  });

  const total = sections["80c"] + sections["80d"] + sections.hra + sections.lta + sections.other;
  const annualGross = monthlySalary * 12;
  const reduced = Math.max(annualGross - 75000 - Math.min(total, 500000), 0);

  const set = (key: keyof typeof sections, v: string) => {
    setSections((s) => ({ ...s, [key]: Math.max(0, Number(v) || 0) }));
  };

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/tax-declarations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy: currentFy, sections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      toast("success", existing ? "Declaration updated — pending HR verification" : "Declaration submitted for verification");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <Badge tone="info" className="font-mono">{currentFy}</Badge>
          {existing && (
            <Badge tone={existing.status === "verified" ? "success" : existing.status === "rejected" ? "danger" : "warning"}>
              {existing.status}
            </Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="80C — PF, PPF, ELSS, LIC, tuition (max ₹1.5L)" hint="Total across all 80C instruments">
            <Input type="number" min={0} value={sections["80c"]} onChange={(e) => set("80c", e.target.value)} />
          </Field>
          <Field label="80D — Health insurance premiums (max ₹25K/₹50K)">
            <Input type="number" min={0} value={sections["80d"]} onChange={(e) => set("80d", e.target.value)} />
          </Field>
          <Field label="HRA — rent paid (if not covered by allowance)">
            <Input type="number" min={0} value={sections.hra} onChange={(e) => set("hra", e.target.value)} />
          </Field>
          <Field label="LTA — leave travel allowance">
            <Input type="number" min={0} value={sections.lta} onChange={(e) => set("lta", e.target.value)} />
          </Field>
          <Field label="Other deductions (80G, 80E, NPS 80CCD…)" className="sm:col-span-2">
            <Input type="number" min={0} value={sections.other} onChange={(e) => set("other", e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3">
          <span className="text-[13px] font-medium">Total declared</span>
          <span className="font-display text-lg font-bold text-indigo-300">{formatMoney(total)}</span>
        </div>

        <Button onClick={submit} loading={saving} className="mt-4">
          <Save className="h-4 w-4" /> {existing ? "Update declaration" : "Submit declaration"}
        </Button>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {name} — your declaration is reviewed by HR before it reduces TDS on upcoming payslips.
        </p>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> TDS estimate
          </div>
          <dl className="mt-3 space-y-2.5 text-[12.5px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Annual gross</dt>
              <dd className="font-mono">{formatMoney(annualGross)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Declared investments</dt>
              <dd className="font-mono text-emerald-300">{formatMoney(total)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/5 pt-2">
              <dt className="text-muted-foreground">Taxable (new regime, est.)</dt>
              <dd className="font-mono font-medium">{formatMoney(reduced)}</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-xl border border-edge bg-tint px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            The verified total reduces taxable income in the TDS calculation. Keep your investment proofs ready — HR may ask to verify.
          </p>
        </div>

        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <BadgeCheck className="h-4 w-4 text-brand" /> Previous years
          </div>
          {declarations.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-muted-foreground">No declarations yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-white/[0.04]">
              {declarations.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-[12.5px]">{d.fy}</span>
                  <Badge tone={d.status === "verified" ? "success" : d.status === "rejected" ? "danger" : "warning"} className="capitalize">
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
