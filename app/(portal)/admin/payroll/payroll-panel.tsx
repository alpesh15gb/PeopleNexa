"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, Eye, Banknote, Download, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  salary: number | null;
  accountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  department: { name: string } | null;
  branch: { name: string } | null;
}

interface Payslip {
  id: string;
  month: string;
  baseSalary: number;
  allowances: number;
  overtimePay: number;
  grossEarnings: number;
  pfEmployee: number;
  pfEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  professionalTax: number;
  tds: number;
  lateFines: number;
  loanDeduction: number;
  deductions: number;
  netSalary: number;
  status: string;
  note: string | null;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  overtimeHours: number;
}

interface Row {
  employee: Employee;
  payslip: Payslip | null;
}

const BANKS = [
  { key: "generic", label: "Generic NEFT (SBI/Axis/Kotak)" },
  { key: "hdfc", label: "HDFC eNET salary" },
  { key: "icici", label: "ICICI PAB-SAL salary transfer" },
];

export function PayrollPanel({
  month,
  rows,
  totals,
  generated,
}: {
  month: string;
  rows: Row[];
  totals: { gross: number; deductions: number; net: number; paid: number };
  generated: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ employee: Employee; payslip: Payslip } | null>(null);
  const [bank, setBank] = useState("generic");
  const [debitAccount, setDebitAccount] = useState("");

  const missingBank = rows.filter((r) => r.payslip && (!r.employee.accountNumber || !r.employee.ifscCode)).length;

  async function generate() {
    setBusy("generate");
    try {
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to generate payslips");
        return;
      }
      toast("success", `Generated ${data.created} payslips for ${month}${data.loanApplied ? ` · ${formatMoney(data.loanApplied)} deducted for loans` : ""}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/payroll/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed to update");
        return;
      }
      toast("success", status === "paid" ? "Payslip marked as paid" : "Payslip reverted to draft");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function exportBankFile() {
    if (bank === "icici" && !debitAccount) {
      toast("error", "Enter your company debit account number for the ICICI file");
      return;
    }
    setBusy("export");
    try {
      const q = new URLSearchParams({ month, bank, ...(debitAccount ? { debitAccount } : {}) });
      const res = await fetch(`/api/payroll/export?${q.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", data.error ?? "Failed to export");
        return;
      }
      const blob = await res.blob();
      const filename = (res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/) ?? [])[1] ?? `salary-${month}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      const skipped = res.headers.get("X-Skipped-Rows");
      toast("success", skipped ? `Bank file downloaded (${skipped} skipped — no bank details)` : "Bank file downloaded");
    } finally {
      setBusy(null);
    }
  }

  const stats = [
    { label: "Payslips", value: generated, cls: "text-foreground" },
    { label: "Gross", value: formatMoney(totals.gross), cls: "text-emerald-300" },
    { label: "Deductions", value: formatMoney(totals.deductions), cls: "text-rose-300" },
    { label: "Net pay", value: formatMoney(totals.net), cls: "text-indigo-300" },
    { label: "Paid", value: `${totals.paid}/${generated}`, cls: "text-amber-300" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <div className="flex items-center gap-2">
          <Input
            type="month"
            defaultValue={month}
            onChange={(e) => e.target.value && router.push(`/admin/payroll?month=${e.target.value}`)}
            className="w-44"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bank} onChange={(e) => setBank(e.target.value)} className="w-56">
            {BANKS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </Select>
          {bank === "icici" && (
            <Input value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)} placeholder="Debit account no." className="w-40" />
          )}
          <Button size="sm" variant="outline" loading={busy === "export"} onClick={exportBankFile} disabled={generated === 0}>
            <Download className="h-3.5 w-3.5" /> Bank file
          </Button>
          <Button size="sm" variant="outline" loading={busy === "generate"} onClick={generate}>
            <Sparkles className="h-3.5 w-3.5" /> Generate payslips
          </Button>
        </div>
      </div>

      {missingBank > 0 && (
        <div className="flex items-center gap-2 border-b border-amber-400/15 bg-amber-500/5 px-5 py-2.5 text-[12.5px] text-amber-300">
          <Landmark className="h-4 w-4 shrink-0" />
          {missingBank} employee{missingBank > 1 ? "s have" : " has"} a payslip but no bank details — add account number + IFSC under Employees to include them in the bank file.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-b border-edge p-5 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-edge bg-tint px-3.5 py-3">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-display text-lg font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Employee</TH>
            <TH className="hidden md:table-cell">Department</TH>
            <TH className="text-right">Base salary</TH>
            <TH className="text-right">Net pay</TH>
            <TH>Status</TH>
            <TH className="w-32" />
          </TR>
        </THead>
        <TBody>
          {rows.map(({ employee, payslip }) => (
            <TR key={employee.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                    {(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}
                  </div>
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {employee.firstName} {employee.lastName}
                      {!employee.accountNumber && payslip && (
                        <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-300">no bank</span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">{employee.employeeNumber}</p>
                  </div>
                </div>
              </TD>
              <TD className="hidden md:table-cell">
                <span className="text-[13px] text-muted-foreground">{employee.department?.name ?? "—"}</span>
              </TD>
              <TD className="text-right font-mono text-[13px]">
                {employee.salary ? formatMoney(employee.salary) : <Badge tone="neutral">no salary</Badge>}
              </TD>
              <TD className="text-right font-mono text-[13px] font-semibold">
                {payslip ? formatMoney(payslip.netSalary) : "—"}
              </TD>
              <TD>{payslip ? <StatusPill status={payslip.status} /> : <Badge tone="neutral">not generated</Badge>}</TD>
              <TD>
                {payslip ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setViewing({ employee, payslip })}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {payslip.status === "draft" ? (
                      <Button size="sm" variant="success" loading={busy === payslip.id} onClick={() => setStatus(payslip.id, "paid")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Pay
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" loading={busy === payslip.id} onClick={() => setStatus(payslip.id, "draft")}>
                        Draft
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-muted-foreground/60">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <PayslipModal data={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function PayslipModal({
  data,
  onClose,
}: {
  data: { employee: Employee; payslip: Payslip } | null;
  onClose: () => void;
}) {
  const p = data?.payslip;
  const emp = data?.employee;
  if (!p || !emp) return null;

  const earnings = [
    { label: "Basic salary", value: p.baseSalary, strong: false },
    { label: "Allowances", value: p.allowances, strong: false },
    { label: `Overtime (${p.overtimeHours} h)`, value: p.overtimePay, strong: false },
  ];
  const deductions = [
    { label: "EPF (employee)", value: p.pfEmployee },
    { label: "ESIC (employee)", value: p.esicEmployee },
    { label: "Professional tax", value: p.professionalTax },
    { label: "TDS (income tax)", value: p.tds },
    { label: `Late fines (${p.lateDays} late)`, value: p.lateFines },
    { label: "Loan / advance", value: p.loanDeduction },
  ].filter((d) => d.value > 0);

  return (
    <Modal open={data !== null} onClose={onClose} title={`Payslip · ${p.month}`} size="md">
      <div className="flex items-center gap-3 border-b border-edge pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-[12px] font-bold text-white">
          {(emp.firstName[0] ?? "") + (emp.lastName[0] ?? "")}
        </div>
        <div>
          <p className="font-display text-[15px] font-semibold">{emp.firstName} {emp.lastName}</p>
          <p className="text-[12px] text-muted-foreground">
            {emp.employeeNumber} · {emp.department?.name ?? "—"} · {emp.branch?.name ?? "—"}
          </p>
        </div>
        <div className="ml-auto">
          <StatusPill status={p.status} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11.5px] text-muted-foreground">
        <span className="rounded-md bg-tint px-2 py-1">{p.presentDays} present</span>
        <span className="rounded-md bg-tint px-2 py-1">{p.lateDays} late</span>
        <span className="rounded-md bg-tint px-2 py-1">{p.halfDays} half-day</span>
        <span className="rounded-md bg-tint px-2 py-1">{p.absentDays} absent</span>
      </div>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-edge bg-tint/50 p-3.5">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-emerald-300">Earnings</p>
          {earnings.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-1 text-[13px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono">{formatMoney(r.value)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-2">
            <span className="text-[13px] font-medium">Gross earnings</span>
            <span className="font-mono font-semibold">{formatMoney(p.grossEarnings)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-tint/50 p-3.5">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-rose-300">Deductions</p>
          {deductions.length === 0 && <p className="py-1 text-[13px] text-muted-foreground">No deductions this month.</p>}
          {deductions.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-1 text-[13px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono">− {formatMoney(r.value)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-white/5 pt-2">
            <span className="text-[13px] font-medium">Total deductions</span>
            <span className="font-mono font-semibold">− {formatMoney(p.deductions)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-indigo-400/15 bg-indigo-500/5 px-4 py-3">
          <span className="font-display text-sm font-semibold">Net pay</span>
          <span className="font-display text-xl font-bold text-indigo-300">{formatMoney(p.netSalary)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3.5 py-2.5 text-[12.5px] text-emerald-300">
        <Banknote className="h-4 w-4" />
        {p.status === "paid" ? "This salary has been disbursed." : "Draft — not yet disbursed."}
      </div>
    </Modal>
  );
}
