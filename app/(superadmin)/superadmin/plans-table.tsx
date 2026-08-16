"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { MODULES, type PlanDef } from "@/lib/modules";
import { useToast } from "@/components/ui/toast";

type Usage = Record<string, { count: number; seats: number }>;

export function PlansTable({
  plans,
  usage,
  customized = [],
}: {
  plans: PlanDef[];
  usage: Usage;
  customized?: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<PlanDef | null>(null);

  let mrr = 0;
  let arr = 0;
  const rows = plans.map((p) => {
    const u = usage[p.key] ?? { count: 0, seats: 0 };
    const m = u.count > 0 ? u.seats * p.pricePerSeat : 0;
    const a = u.count > 0 ? u.seats * p.annualPricePerSeat * 12 : 0;
    mrr += m;
    arr += a;
    return { plan: p, count: u.count, seats: u.seats, mrr: m, arr: a };
  });
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-edge text-[11px] uppercase tracking-wider text-muted-foreground/70">
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Price / seat</th>
                <th className="px-3 py-3 font-medium">Annual / seat</th>
                <th className="px-3 py-3 font-medium">Trial days</th>
                <th className="px-3 py-3 font-medium">Tenants</th>
                <th className="px-3 py-3 font-medium">Licensed seats</th>
                <th className="px-3 py-3 font-medium text-right">MRR</th>
                <th className="px-3 py-3 font-medium text-right">ARR</th>
                <th className="px-3 py-3 font-medium text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map(({ plan, count, seats, mrr: pm, arr: pa }) => (
                <tr key={plan.key} className="transition-colors hover:bg-tint/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{plan.label}</span>
                      {customized.includes(plan.key) && (
                        <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-300">
                          edited
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{plan.pricePerSeat > 0 ? `₹${plan.pricePerSeat}` : plan.key === "enterprise" ? "Custom" : "Free"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{plan.annualPricePerSeat > 0 ? `₹${plan.annualPricePerSeat}` : "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{plan.trialDays > 0 ? `${plan.trialDays}` : "—"}</td>
                  <td className="px-3 py-3">{count}</td>
                  <td className="px-3 py-3">{seats.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-300">{inr(pm)}</td>
                  <td className="px-3 py-3 text-right font-mono text-violet-300">{inr(pa)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => setEditing(plan)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      title="Edit plan"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      {editing && (
        <EditPlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function EditPlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanDef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState(plan.label);
  const [price, setPrice] = useState(String(plan.pricePerSeat));
  const [annual, setAnnual] = useState(String(plan.annualPricePerSeat));
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [seats, setSeats] = useState(String(plan.seats));
  const [modules, setModules] = useState<Set<string>>(new Set(plan.modules));

  const toggleModule = (key: string) => {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: plan.key,
          label,
          pricePerSeat: price === "" ? null : Number(price),
          annualPricePerSeat: annual === "" ? null : Number(annual),
          trialDays: trialDays === "" ? null : Number(trialDays),
          seats: seats === "" ? null : Number(seats),
          modules: [...modules],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save plan");
      toast("success", `${plan.label} plan updated.`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save plan");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm(`Reset ${plan.label} to default pricing & modules?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/superadmin/plans/${plan.key}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset plan");
      toast("success", `${plan.label} reset to defaults.`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset plan");
    } finally {
      setBusy(false);
    }
  };

  const numField = (v: string) => (v === "" ? "" : Number(v));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="card-surface relative max-h-[90vh] w-full max-w-2xl animate-scale-in overflow-y-auto rounded-2xl bg-card-2 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold">Edit {plan.label} plan</h3>
            <p className="text-[12.5px] text-muted-foreground">Pricing, seats, trial & included modules</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-tint hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan name" className="col-span-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={plan.label} />
          </Field>
          <Field label="Price / seat / month (₹)">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} placeholder="0 = free" />
          </Field>
          <Field label="Annual price / seat (₹)" hint="Monthly-equivalent when billed yearly">
            <Input value={annual} onChange={(e) => setAnnual(e.target.value)} type="number" min={0} placeholder="0 = same as monthly" />
          </Field>
          <Field label="Trial days">
            <Input value={trialDays} onChange={(e) => setTrialDays(e.target.value)} type="number" min={0} placeholder="0 = no trial" />
          </Field>
          <Field label="Seats">
            <Input value={seats} onChange={(e) => setSeats(e.target.value)} type="number" min={1} />
          </Field>
        </div>

        <p className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Included modules ({modules.size}/{MODULES.length})
        </p>
        <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {MODULES.map((m) => {
            const on = modules.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleModule(m.key)}
                className="flex items-center gap-2.5 rounded-lg border border-edge bg-tint px-3 py-2 text-left transition-all hover:border-edge-strong"
              >
                <span
                  className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    on ? "border-indigo-400/40 bg-indigo-500/20 text-indigo-300" : "border-edge-strong text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-[12.5px] font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              <Save className="h-4 w-4" /> Save plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
