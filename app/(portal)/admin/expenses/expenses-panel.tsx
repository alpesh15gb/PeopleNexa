"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Banknote, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate, monthKeyIST } from "@/lib/dates";

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

export function ExpensesPanel({ claims, actorId, canUsePayroll }: { claims: Claim[]; actorId: string; canUsePayroll: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);
  const [action, setAction] = useState<"approved" | "rejected" | "settled" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [payrollMonth, setPayrollMonth] = useState(monthKeyIST);
  const externalSettlement = action === "settled" && viewing?.status === "pending";

  function view(claim: Claim, nextAction: typeof action = null) {
    setViewing(claim);
    setAction(nextAction);
    setReviewNote(claim.reviewNote ?? "");
    setPayrollMonth(monthKeyIST());
  }

  async function update(id: string, status: NonNullable<typeof action>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status, reviewNote,
          ...(status === "approved" ? { payrollMonth } : {}),
          ...(externalSettlement ? { settlementMethod: "external" } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      toast("success", `Claim ${status}.`);
      setViewing(null);
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
        <div className="divide-y divide-[color:var(--border)]">
          {claims.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <button
                onClick={() => view(c)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                  {(c.employee.firstName[0] ?? "") + (c.employee.lastName[0] ?? "")}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{c.title}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {c.employee.firstName} {c.employee.lastName} · {c.category} · {formatDate(new Date(c.createdAt))}
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[13.5px] font-bold">₹{c.amount.toLocaleString("en-IN")}</span>
                <Badge tone={tone[c.status] ?? "neutral"} className="capitalize">{c.status}</Badge>
                {c.status === "pending" && c.employee.id !== actorId && (
                  <div className="flex gap-1.5">
                    {canUsePayroll && (
                      <Button size="sm" variant="success" disabled={Boolean(busy)} onClick={() => view(c, "approved")}>
                        <Check className="h-3.5 w-3.5" /> Approve for payroll
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => view(c, "settled")}>
                      <Banknote className="h-3.5 w-3.5" /> Record external payment
                    </Button>
                    <Button size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => view(c, "rejected")}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                )}
                {c.status === "approved" && c.employee.id !== actorId && (
                  <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => view(c, "settled")}>
                    <Banknote className="h-3.5 w-3.5" /> Mark settled
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(viewing)} onClose={() => !busy && setViewing(null)} title={viewing?.title} size="sm">
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
            {action ? (
              <>
                {action === "approved" && <Field label="Payroll month" hint="Adds one reimbursement to this payroll period.">
                  <Input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} />
                </Field>}
                {action === "settled" && <p className="text-sm text-muted-foreground">
                  {externalSettlement ? "Confirm that this claim has already been paid outside payroll. Enter the payment reference below." : "An approved claim can be marked settled after its reimbursement appears in paid payroll."}
                </p>}
                <Field label={externalSettlement ? "Payment reference" : "Review note"} hint={externalSettlement ? undefined : "Optional. The employee can see this note."}>
                  <Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setViewing(null)}>Cancel</Button>
                  <Button variant={action === "rejected" ? "danger" : "primary"} loading={busy === viewing.id} disabled={(externalSettlement && !reviewNote.trim()) || (action === "approved" && !payrollMonth)} onClick={() => void update(viewing.id, action)}>
                    {action === "approved" ? "Approve for payroll" : action === "rejected" ? "Reject claim" : externalSettlement ? "Record external payment" : "Mark settled"}
                  </Button>
                </div>
              </>
            ) : viewing.reviewNote && <p className="rounded-lg bg-tint p-3 text-sm"><span className="block font-medium">Review note</span>{viewing.reviewNote}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
