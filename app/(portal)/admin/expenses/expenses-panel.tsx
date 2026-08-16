"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Banknote, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { toDateKey } from "@/lib/dates";

type Claim = {
  id: string;
  title: string;
  category: string;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

const tone: Record<string, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  approved: "info",
  settled: "success",
  rejected: "danger",
};

export function ExpensesPanel({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);

  async function update(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      toast("success", `Claim ${status}.`);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {claims.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title="No claims yet"
          description="Employee-submitted expense claims will appear here."
        />
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {claims.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <button
                onClick={() => setViewing(c)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                  {(c.employee.firstName[0] ?? "") + (c.employee.lastName[0] ?? "")}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {c.employee.firstName} {c.employee.lastName} · {c.category} · {toDateKey(new Date(c.createdAt))}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13.5px] font-bold">₹{c.amount.toLocaleString("en-IN")}</span>
                <Badge tone={tone[c.status] ?? "neutral"} className="capitalize">{c.status}</Badge>
                {c.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="success" loading={busy === c.id} onClick={() => update(c.id, "approved")}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" loading={busy === c.id} onClick={() => update(c.id, "settled")}>
                      <Banknote className="h-3.5 w-3.5" /> Settle
                    </Button>
                    <Button size="sm" variant="danger" loading={busy === c.id} onClick={() => update(c.id, "rejected")}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                )}
                {c.status === "approved" && (
                  <Button size="sm" variant="outline" loading={busy === c.id} onClick={() => update(c.id, "settled")}>
                    <Banknote className="h-3.5 w-3.5" /> Mark settled
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} size="sm">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl bg-tint p-3">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Amount</p>
                <p className="mt-0.5 font-mono text-lg font-bold">₹{viewing.amount.toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-xl bg-tint p-3">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Category</p>
                <p className="mt-0.5 font-medium capitalize">{viewing.category}</p>
              </div>
            </div>
            {viewing.description && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{viewing.description}</p>
            )}
            {viewing.receiptUrl && (
              <img src={viewing.receiptUrl} alt="Receipt" className="max-h-72 w-full rounded-xl border border-edge object-contain" />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
