"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";

interface Decl {
  id: string;
  fy: string;
  sections: Record<string, number>;
  status: string;
  note: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
}

export function TaxReviewPanel({ currentFy, declarations, fys }: { currentFy: string; declarations: Decl[]; fys: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [fy, setFy] = useState(currentFy);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = declarations.filter((d) => d.fy === fy);

  async function review(id: string, action: "verify" | "reject") {
    setBusy(id);
    try {
      const res = await fetch(`/api/tax-declarations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      toast("success", action === "verify" ? "Declaration verified — TDS will now use these investments" : "Declaration rejected");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  const pendingCount = filtered.filter((d) => d.status === "submitted").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={fy} onChange={(e) => setFy(e.target.value)} className="w-44">
            {fys.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
          {pendingCount > 0 && <Badge tone="warning">{pendingCount} pending verification</Badge>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">No declarations for {fy}.</p>
      ) : (
        <div className="divide-y divide-[color:var(--border)]">
          {filtered.map((d) => {
            const total = Object.values(d.sections).reduce((s, v) => s + (Number(v) || 0), 0);
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">
                      {d.employee.firstName} {d.employee.lastName}
                    </p>
                    <span className="text-[11.5px] text-muted-foreground">{d.employee.employeeNumber}</span>
                    <Badge
                      tone={d.status === "verified" ? "success" : d.status === "rejected" ? "danger" : "warning"}
                      className="capitalize"
                    >
                      {d.status}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                    <span>80C: {formatMoney(d.sections["80c"] ?? 0)}</span>
                    <span>80D: {formatMoney(d.sections["80d"] ?? 0)}</span>
                    <span>HRA: {formatMoney(d.sections.hra ?? 0)}</span>
                    <span>LTA: {formatMoney(d.sections.lta ?? 0)}</span>
                    <span>Other: {formatMoney(d.sections.other ?? 0)}</span>
                    <span className="font-semibold text-foreground">Total: {formatMoney(total)}</span>
                  </div>
                  {d.note && <p className="mt-1 text-[11.5px] italic text-muted-foreground/70">“{d.note}”</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {d.status !== "verified" && (
                    <Button size="sm" variant="success" loading={busy === d.id} onClick={() => review(d.id, "verify")}>
                      <Check className="h-3.5 w-3.5" /> Verify
                    </Button>
                  )}
                  {d.status !== "rejected" && (
                    <Button size="sm" variant="ghost" loading={busy === d.id} onClick={() => review(d.id, "reject")}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  )}
                  {d.status === "verified" && <ShieldCheck className="h-4 w-4 text-emerald-400" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
