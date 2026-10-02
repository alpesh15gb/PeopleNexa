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
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
}

export function LoansPanel({
  loans,
  employees,
}: {
  loans: Loan[];
  employees: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [closing, setClosing] = useState<string | null>(null);
  const [closingBusy, setClosingBusy] = useState(false);
  const [loanType, setLoanType] = useState("advance");

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
      toast(
        "success",
        data.loan.type === "loan"
          ? "Loan created — deducted from payslips"
          : "Advance given — will be deducted from the next payslip",
      );
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Could not create the loan or advance.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function closeLoan(id: string) {
    setClosingBusy(true);
    try {
      const res = await fetch(`/api/loans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) return toast("error", "Failed to close");
      toast("success", "Loan marked as closed");
      setClosing(null);
      router.refresh();
    } catch {
      toast("error", "Could not close the loan. Try again.");
    } finally {
      setClosingBusy(false);
    }
  }

  async function removeLoan(id: string) {
    setConfirmDelete(id);
  }

  async function doRemoveLoan() {
    if (!confirmDelete) return;
    setDeleting(true);
    const res = await fetch(`/api/loans/${confirmDelete}`, {
      method: "DELETE",
    });
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
  const visible = loans.filter(
    (loan) =>
      (status === "all" || loan.status === status) &&
      `${loan.employee.firstName} ${loan.employee.lastName} ${loan.employee.employeeNumber}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          {active.length} active · {formatMoney(totalOutstanding)} outstanding
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Give advance / loan
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 p-5">
        <Field label="Search employees" className="min-w-48 flex-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or employee number"
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">Active deductions</option>
            <option value="closed">Closed</option>
            <option value="all">All loans & advances</option>
          </Select>
        </Field>
      </div>
      <div className="hidden md:block">
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
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-12 text-center text-[13px] text-muted-foreground"
                >
                  No loans or advances match these filters.
                </td>
              </tr>
            ) : (
              visible.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <p className="text-[13.5px] font-medium">
                      {l.employee.firstName} {l.employee.lastName}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {l.employee.employeeNumber}
                    </p>
                  </TD>
                  <TD>
                    <Badge tone={l.type === "loan" ? "violet" : "info"}>
                      {l.type}
                    </Badge>
                  </TD>
                  <TD className="text-right font-mono">
                    {formatMoney(l.amount)}
                  </TD>
                  <TD className="text-right font-mono font-semibold">
                    {formatMoney(l.outstanding)}
                  </TD>
                  <TD className="text-[12.5px] text-muted-foreground">
                    {l.emiAmount > 0
                      ? `${formatMoney(l.emiAmount)} × ${l.emiCount}`
                      : "full balance"}
                  </TD>
                  <TD className="text-[12.5px] text-muted-foreground">
                    {l.startMonth}
                  </TD>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Mark closed"
                          aria-label={`Mark loan ${l.id} closed`}
                          onClick={() => setClosing(l.id)}
                        >
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-300"
                        title="Delete"
                        aria-label={`Delete loan ${l.id}`}
                        onClick={() => removeLoan(l.id)}
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
      <div className="divide-y divide-edge md:hidden">
        {visible.map((loan) => (
          <article key={loan.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {loan.employee.firstName} {loan.employee.lastName}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {loan.employee.employeeNumber} · {loan.type}
                </p>
              </div>
              <Badge tone={loan.status === "active" ? "success" : "neutral"}>
                {loan.status}
              </Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Outstanding</dt>
                <dd className="font-semibold">
                  {formatMoney(loan.outstanding)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Original amount</dt>
                <dd>{formatMoney(loan.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Deduction</dt>
                <dd>
                  {loan.emiAmount > 0
                    ? `${formatMoney(loan.emiAmount)} × ${loan.emiCount}`
                    : "Full balance"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>First deduction</dt>
                <dd>{loan.startMonth}</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              {loan.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setClosing(loan.id)}
                >
                  Mark closed
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void removeLoan(loan.id)}
              >
                Delete
              </Button>
            </div>
          </article>
        ))}
        {!visible.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No loans or advances match these filters.
          </p>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Give advance / loan"
        description="Auto-deducted from monthly payslips starting the chosen month"
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Employee">
            <Select name="employeeId" required>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} · {e.employeeNumber}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select
                name="type"
                value={loanType}
                onChange={(event) => setLoanType(event.target.value)}
              >
                <option value="advance">Advance (deducted in full)</option>
                <option value="loan">Loan (EMI deduction)</option>
              </Select>
            </Field>
            <Field label="Amount (₹)">
              <Input
                name="amount"
                type="number"
                min={1}
                step={1}
                required
                placeholder="e.g. 10000"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {loanType === "loan" ? (
              <Field
                label="Number of monthly instalments"
                hint="1 = deduct the whole balance"
              >
                <Input
                  name="emiCount"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={1}
                />
              </Field>
            ) : (
              <input type="hidden" name="emiCount" value="1" />
            )}
            <Field label="First deduction month">
              <Input
                name="startMonth"
                type="month"
                defaultValue={monthKey(new Date())}
                required
              />
            </Field>
          </div>
          <Field label="Note">
            <Input
              name="note"
              placeholder="Optional — e.g. festival advance, bike loan"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <HandCoins aria-hidden="true" className="h-4 w-4" /> Create
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(closing)}
        title="Close this loan or advance?"
        description="Future payroll deductions stop. Previously recorded deductions remain in payroll history."
        confirmLabel="Mark closed"
        busy={closingBusy}
        onCancel={() => {
          if (!closingBusy) setClosing(null);
        }}
        onConfirm={() => {
          if (closing) void closeLoan(closing);
        }}
      />
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
