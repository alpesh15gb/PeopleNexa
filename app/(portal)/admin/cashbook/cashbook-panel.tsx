"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TrendingDown, TrendingUp, Wallet, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard, EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import { toDateKey, todayKey } from "@/lib/dates";

export interface CashbookEntryRow {
  id: string;
  date: string;
  type: string;
  category: string;
  amount: number;
  note: string | null;
  paymentMode: string | null;
  createdAt: string;
}

const categoryTone: Record<string, "violet" | "info" | "warning" | "neutral"> = {
  salary: "violet",
  advance: "info",
  vendor: "warning",
  expense: "neutral",
  other: "neutral",
};

export function CashbookPanel({
  month,
  totals,
  entries,
}: {
  month: string;
  totals: { cashIn: number; cashOut: number; balance: number };
  entries: CashbookEntryRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CashbookEntryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/cashbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.get("date"),
          type: form.get("type"),
          category: form.get("category"),
          amount: form.get("amount"),
          paymentMode: form.get("paymentMode") || undefined,
          note: form.get("note") || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to add entry");
        return;
      }
      toast("success", "Cashbook entry added");
      setAddOpen(false);
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cashbook/${confirmDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Entry deleted");
      setConfirmDelete(null);
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Cash in"
          value={formatMoney(totals.cashIn)}
          sub={`${month} · ${entries.filter((e) => e.type === "cash_in").length} entries`}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
          tone="emerald"
        />
        <StatCard
          label="Cash out"
          value={formatMoney(totals.cashOut)}
          sub={`${month} · ${entries.filter((e) => e.type === "cash_out").length} entries`}
          icon={<TrendingDown className="h-4.5 w-4.5" />}
          tone="rose"
        />
        <StatCard
          label="Balance"
          value={formatMoney(totals.balance)}
          sub="In minus out"
          icon={<Wallet className="h-4.5 w-4.5" />}
          tone={totals.balance >= 0 ? "emerald" : "rose"}
        />
        <StatCard
          label="Entries"
          value={entries.length}
          sub={month}
          icon={<BookOpenText className="h-4.5 w-4.5" />}
          tone="sky"
        />
      </div>

      <div className="card-surface overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <Input
            type="month"
            defaultValue={month}
            aria-label="Cashbook month"
            onChange={(e) => e.target.value && router.push(`/admin/cashbook?month=${e.target.value}`)}
            className="w-full sm:w-44"
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add entry
          </Button>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={<BookOpenText className="h-5 w-5" />}
            title="No entries this month"
            description="Record cash-in and cash-out to track your cashbook like PagarBook."
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add entry
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Category</TH>
                <TH>Note</TH>
                <TH>Mode</TH>
                <TH className="text-right">Amount</TH>
                <TH className="w-16" />
              </TR>
            </THead>
            <TBody>
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-[13px] text-muted-foreground">
                    {toDateKey(new Date(e.date))}
                  </TD>
                  <TD>
                    <Badge tone={e.type === "cash_in" ? "success" : "danger"}>
                      {e.type === "cash_in" ? "Cash in" : "Cash out"}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={categoryTone[e.category] ?? "neutral"} className="capitalize">
                      {e.category}
                    </Badge>
                  </TD>
                  <TD className="max-w-48 truncate text-[13px] text-muted-foreground">
                    {e.note || "—"}
                  </TD>
                  <TD className="text-[12.5px] capitalize text-muted-foreground">
                    {e.paymentMode || "—"}
                  </TD>
                  <TD
                    className={`text-right font-mono font-semibold ${
                      e.type === "cash_in" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {e.type === "cash_in" ? "+" : "−"}
                    {formatMoney(e.amount)}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-300"
                        title="Delete entry"
                        aria-label={`Delete cashbook entry ${e.id}`}
                        onClick={() => setConfirmDelete(e)}
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => !saving && setAddOpen(false)}
        title="Add cashbook entry"
        description="Manual cash-in / cash-out record — payroll payouts do not auto-post here"
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">
              <Input name="date" type="date" defaultValue={todayKey()} required />
            </Field>
            <Field label="Amount (₹)">
              <Input name="amount" type="number" min={0.01} step={0.01} required placeholder="e.g. 5000" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select name="type" defaultValue="cash_out">
                <option value="cash_in">Cash in</option>
                <option value="cash_out">Cash out</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue="expense">
                <option value="salary">Salary</option>
                <option value="advance">Advance</option>
                <option value="vendor">Vendor</option>
                <option value="expense">Expense</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <Field label="Payment mode">
            <Select name="paymentMode" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Note" hint="Optional — e.g. tea stall, supplier payment">
            <Input name="note" maxLength={500} placeholder="Optional note" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add entry
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this entry?"
        description="This cashbook row will be removed. This can't be undone."
        confirmLabel="Delete entry"
        busy={deleting}
        onCancel={() => !deleting && setConfirmDelete(null)}
        onConfirm={doDelete}
      />
    </>
  );
}
