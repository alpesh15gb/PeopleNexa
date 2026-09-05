"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, HandCoins, XCircle, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import { monthKey } from "@/lib/dates";

interface Loan {
  id: string;
  type: string;
  amount: number;
  outstanding: number;
  emiCount: number;
  emiAmount: number;
  startMonth: string;
  lastDeductedMonth: string | null;
  status: string;
  note: string | null;
  createdAt: Date;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
}

export function LoansPanel({ loans, employees }: { loans: Loan[]; employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.get("employeeId"),
          type: form.get("type"),
          amount: form.get("amount"),
          emiCount: form.get("emiCount") || 1,
          startMonth: form.get("startMonth"),
          note: form.get("note"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to create");
        return;
      }
      toast("success", data.loan.type === "loan" ? "Loan created — deducted from payslips" : "Advance given — will be deducted from the next payslip");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function closeLoan(id: string) {
    const res = await fetch(`/api/loans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!res.ok) return toast("error", "Failed to close");
    toast("success", "Loan marked as closed");
    router.refresh();
  }

  async function removeLoan(id: string) {
    setConfirmDelete(id);
  }

  async function doRemoveLoan() {
    if (!confirmDelete) return;
    setDeleting(true);
    const res = await fetch(`/api/loans/${confirmDelete}`, { method: "DELETE" });
    if (!res.ok) {
      toast("error", "Failed to delete");
      setDeleting(false);
      return;
    }
    toast("success", "Loan removed");
    setConfirmDelete(null);
    setDeleting(false);
    router.refresh();
  }

  const active = loans.filter((l) => l.status === "active");
  const totalOutstanding = active.reduce((s, l) => s + l.outstanding, 0);

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">
          {active.length} active · {formatMoney(totalOutstanding)} outstanding
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Give advance / loan
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Employee</TH>
            <TH>Type</TH>
            <TH className="text-right">Amount</TH>
            <TH className="text-right">Outstanding</TH>
            <TH>EMI / deduction</TH>
            <TH>Started</TH>
            <TH>Status</TH>
            <TH className="w-24" />
          </TR>
        </THead>
        <TBody>
          {loans.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-[13px] text-muted-foreground">
                No loans or advances yet. Advances are auto-deducted from the next payslip run.
              </td>
            </tr>
          ) : (
            loans.map((l) => (
              <TR key={l.id}>
                <TD>
                  <p className="text-[13.5px] font-medium">{l.employee.firstName} {l.employee.lastName}</p>
                  <p className="text-[11.5px] text-muted-foreground">{l.employee.employeeNumber}</p>
                </TD>
                <TD>
                  <Badge tone={l.type === "loan" ? "violet" : "info"}>{l.type}</Badge>
                </TD>
                <TD className="text-right font-mono">{formatMoney(l.amount)}</TD>
                <TD className="text-right font-mono font-semibold">{formatMoney(l.outstanding)}</TD>
                <TD className="text-[12.5px] text-muted-foreground">
                  {l.emiAmount > 0 ? `${formatMoney(l.emiAmount)} × ${l.emiCount}` : "full balance"}
                </TD>
                <TD className="text-[12.5px] text-muted-foreground">{l.startMonth}</TD>
                <TD>
                  {l.status === "active" ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Closed</Badge>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    {l.status === "active" && (
                      <Button size="sm" variant="ghost" title="Mark closed" aria-label={`Mark loan ${l.id} closed`} onClick={() => closeLoan(l.id)}>
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-rose-300" title="Delete" aria-label={`Delete loan ${l.id}`} onClick={() => removeLoan(l.id)}>
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="Give advance / loan" description="Auto-deducted from monthly payslips starting the chosen month" size="sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Employee">
            <Select name="employeeId" required>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeNumber}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select name="type" defaultValue="advance">
                <option value="advance">Advance (deducted in full)</option>
                <option value="loan">Loan (EMI deduction)</option>
              </Select>
            </Field>
            <Field label="Amount (₹)">
              <Input name="amount" type="number" min={1} step={1} required placeholder="e.g. 10000" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="EMI count (loans only)" hint="1 = deduct the whole balance">
              <Input name="emiCount" type="number" min={1} max={60} defaultValue={1} />
            </Field>
            <Field label="First deduction month">
              <Input name="startMonth" type="month" defaultValue={monthKey(new Date())} required />
            </Field>
          </div>
          <Field label="Note">
            <Input name="note" placeholder="Optional — e.g. festival advance, bike loan" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>
              <HandCoins aria-hidden="true" className="h-4 w-4" /> Create
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this loan?"
        description="Outstanding balance will no longer be deducted. This can't be undone."
        confirmLabel="Delete loan"
        busy={deleting}
        onCancel={() => !deleting && setConfirmDelete(null)}
        onConfirm={doRemoveLoan}
      />
    </>
  );
}
