"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { automaticShiftPolicy, DEFAULT_AUTOMATIC_SHIFT_POLICY, type AutomaticShiftPolicy } from "@/lib/automatic-shifts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AutomaticShiftsPanel({ branches, shifts }: { branches: { id: string; name: string; policy: unknown }[]; shifts: { id: string; name: string; startTime: string; endTime: string; isNightShift: boolean }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [policy, setPolicy] = useState<AutomaticShiftPolicy>(() => automaticShiftPolicy(branches[0]?.policy) ?? { ...DEFAULT_AUTOMATIC_SHIFT_POLICY });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/branches/${branchId}/automatic-shifts`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const result = await response.json();
      if (!response.ok) { toast("error", result.error ?? "Unable to save automatic shifts."); return; }
      toast("success", "Automatic shift settings saved. Applies to subsequent reconciliation.");
      router.refresh();
    } catch { toast("error", "Unable to save automatic shifts."); }
    finally { setSaving(false); }
  }
  return <section className="card-surface space-y-4 rounded-xl p-5">
    <h2 className="font-display text-lg font-semibold">Automatic shift selection</h2>
    <p className="text-sm text-muted-foreground">Employees can work any selected shift. Their first authorized IN punch selects the closest configured shift start. Explicit rosters override this setting. Existing finalized attendance is preserved.</p>
    <label className="block text-sm">Branch<select aria-label="Automatic shift branch" className="ml-3 rounded-lg border border-edge bg-card p-2" value={branchId} onChange={(e) => { setBranchId(e.target.value); setPolicy(automaticShiftPolicy(branches.find((b) => b.id === e.target.value)?.policy) ?? { ...DEFAULT_AUTOMATIC_SHIFT_POLICY }); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })} />Enable automatic shift selection for this branch</label>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Allowed shifts (select at least two)</legend>{shifts.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.shiftIds.includes(s.id)} onChange={(e) => setPolicy({ ...policy, shiftIds: e.target.checked ? [...policy.shiftIds, s.id] : policy.shiftIds.filter((id) => id !== s.id) })} />{s.name} · {s.startTime}–{s.endTime}{s.isNightShift ? " · Overnight" : ""}</label>)}</fieldset>
    <div className="grid gap-3 sm:grid-cols-3">{([ ["earlyMinutes", "IN before shift start (minutes)"], ["lateMinutes", "IN after shift start (minutes)"], ["outMinutes", "OUT after shift end (minutes)"] ] as const).map(([key, label]) => <label key={key} className="space-y-1 text-sm"><span className="block">{label}</span><input aria-label={label} type="number" min={0} max={720} value={policy[key]} className="w-full rounded-lg border border-edge bg-card p-2" onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}</div>
    <p className="text-xs text-muted-foreground">These windows select and pair punches; late marking still uses the shift's saved grace minutes. A punch outside all start windows or an equal-distance match requires review.</p>
    <Button loading={saving} disabled={!branchId || saving} onClick={save}>Save automatic shifts</Button>
  </section>;
}
