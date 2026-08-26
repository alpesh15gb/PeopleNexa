"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, Eye, Banknote, Download, Landmark, Settings2, SlidersHorizontal, Trash2, Plus, FileSpreadsheet, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
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
  payMode?: string;
  department: { name: string } | null;
  branch: { name: string } | null;
}

interface Payslip {
  id: string;
  month: string;
  baseSalary: number;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  grossEarnings: number;
  pfEmployee: number;
  pfEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  professionalTax: number;
  lwf: number;
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
  workedHours: number;
  adjustments: { label: string; amount: number }[] | null;
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

const STATES = ["Gujarat", "Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "Delhi", "Uttar Pradesh", "Rajasthan", "West Bengal", "Other"];

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [complianceType, setComplianceType] = useState("ecr");

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

  async function exportCompliance() {
    setBusy("compliance");
    try {
      const q = new URLSearchParams({ type: complianceType, month });
      const res = await fetch(`/api/payroll/compliance?${q.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", data.error ?? "Failed to export");
        return;
      }
      const blob = await res.blob();
      const filename = (res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/) ?? [])[1] ?? `compliance-${month}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast("success", "Compliance file downloaded");
    } finally {
      setBusy(null);
    }
  }

  async function exportTally() {
    setBusy("tally");
    try {
      const res = await fetch(`/api/payroll/tally?month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", data.error ?? "Failed to export");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tally-journal-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast("success", "Tally journal downloaded");
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
          <Button size="sm" variant="ghost" onClick={() => setAdjustmentsOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Adjustments
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </Button>
          <Select value={bank} onChange={(e) => setBank(e.target.value)} className="w-52">
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
          <Select value={complianceType} onChange={(e) => setComplianceType(e.target.value)} className="w-40">
            <option value="ecr">PF ECR</option>
            <option value="form16">Form 16</option>
            <option value="form24q">Form 24Q</option>
          </Select>
          <Button size="sm" variant="outline" loading={busy === "compliance"} onClick={exportCompliance} disabled={generated === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Compliance
          </Button>
          <Button size="sm" variant="outline" loading={busy === "tally"} onClick={exportTally} disabled={generated === 0}>
            <Scale className="h-3.5 w-3.5" /> Tally
          </Button>
          <Button size="sm" loading={busy === "generate"} onClick={generate}>
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
                    <p className="text-[11.5px] text-muted-foreground">
                      {employee.employeeNumber}
                      {employee.payMode && employee.payMode !== "monthly" && (
                        <span className="ml-2 rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-indigo-300">
                          {employee.payMode.replace("_", " ")}
                        </span>
                      )}
                    </p>
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AdjustmentsModal open={adjustmentsOpen} onClose={() => setAdjustmentsOpen(false)} month={month} rows={rows} />
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
    { label: "Basic salary", value: p.basicSalary || p.baseSalary * 0.5, strong: false },
    { label: "Allowances", value: p.allowances, strong: false },
    ...(p.overtimePay > 0 ? [{ label: `Overtime (${p.overtimeHours} h)`, value: p.overtimePay, strong: false }] : []),
    ...(p.adjustments?.filter((a) => a.amount > 0).map((a) => ({ label: a.label, value: a.amount, strong: false })) ?? []),
  ];
  const deductions = [
    { label: "EPF (employee)", value: p.pfEmployee },
    { label: "ESIC (employee)", value: p.esicEmployee },
    { label: "Professional tax", value: p.professionalTax },
    { label: "LWF", value: p.lwf },
    { label: "TDS (income tax)", value: p.tds },
    { label: `Late fines (${p.lateDays} late)`, value: p.lateFines },
    { label: "Loan / advance", value: p.loanDeduction },
    ...(p.adjustments?.filter((a) => a.amount < 0).map((a) => ({ label: a.label, value: Math.abs(a.amount) })) ?? []),
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
            {emp.payMode && emp.payMode !== "monthly" ? ` · ${emp.payMode.replace("_", " ")}` : ""}
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
        {p.workedHours > 0 && <span className="rounded-md bg-tint px-2 py-1">{p.workedHours}h worked</span>}
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

// ─── Payroll settings ───────────────────────────────────────────────────────

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/config/payroll")
      .then((r) => r.json())
      .then((d) => setCfg(d.config))
      .catch(() => toast("error", "Failed to load settings"))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const set = (path: string, value: unknown) => {
    setCfg((c: any) => {
      const next = { ...c };
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/config/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast("success", "Payroll settings saved — regenerate payslips to apply");
      onClose();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Payroll settings" size="md">
      {loading || !cfg ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic % of salary (PF wage base)">
              <Input type="number" value={cfg.basicPercent} onChange={(e) => set("basicPercent", Number(e.target.value))} />
            </Field>
            <Field label="Allowances %">
              <Input type="number" value={cfg.allowancesPercent} onChange={(e) => set("allowancesPercent", Number(e.target.value))} />
            </Field>
            <Field label="Late fine per late day (₹)">
              <Input type="number" value={cfg.lateFinePerLateDay} onChange={(e) => set("lateFinePerLateDay", Number(e.target.value))} />
            </Field>
            <Field label="OT multiplier">
              <Input type="number" step="0.1" value={cfg.otMultiplier} onChange={(e) => set("otMultiplier", Number(e.target.value))} />
            </Field>
          </div>

          <div className="space-y-3 rounded-xl border border-edge bg-tint p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Statutory</p>
            <div className="grid grid-cols-2 gap-3">
              <ToggleRow label="PF" checked={cfg.pf.enabled} onChange={(v) => set("pf.enabled", v)} />
              <Field label="PF wage ceiling (₹)">
                <Input type="number" value={cfg.pf.wageCeiling} onChange={(e) => set("pf.wageCeiling", Number(e.target.value))} />
              </Field>
              <ToggleRow label="ESIC" checked={cfg.esic.enabled} onChange={(v) => set("esic.enabled", v)} />
              <Field label="ESIC gross ceiling (₹)">
                <Input type="number" value={cfg.esic.grossCeiling} onChange={(e) => set("esic.grossCeiling", Number(e.target.value))} />
              </Field>
              <ToggleRow label="Professional tax" checked={cfg.pt.enabled} onChange={(v) => set("pt.enabled", v)} />
              <Field label="State (PT + LWF slabs)">
                <Select value={cfg.pt.state} onChange={(e) => set("pt.state", e.target.value)}>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <ToggleRow label="LWF (Labour Welfare Fund)" checked={cfg.lwf.enabled} onChange={(v) => set("lwf.enabled", v)} />
              <ToggleRow label="TDS" checked={cfg.tds.enabled} onChange={(v) => set("tds.enabled", v)} />
              <Field label="TDS regime">
                <Select value={cfg.tds.regime} onChange={(e) => set("tds.regime", e.target.value)}>
                  <option value="new">New regime</option>
                  <option value="old">Old regime</option>
                </Select>
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              <Settings2 className="h-4 w-4" /> Save settings
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-edge bg-card px-3.5 py-2.5">
      <span className="text-[13px] font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-gradient-brand" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

// ─── Adjustments (arrears / bonus / one-off) ────────────────────────────────

function AdjustmentsModal({ open, onClose, month, rows }: { open: boolean; onClose: () => void; month: string; rows: Row[] }) {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employeeId: "", type: "arrears", label: "", amount: "", note: "" });

  const load = () => {
    fetch(`/api/payroll/adjustments?month=${month}`)
      .then((r) => r.json())
      .then((d) => setList(d.adjustments))
      .catch(() => toast("error", "Failed to load adjustments"));
  };
  useEffect(() => {
    if (open) {
      setList(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month]);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, month, amount: Number(form.amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast("success", "Adjustment added — regenerate payslips to include it");
      setForm({ employeeId: "", type: "arrears", label: "", amount: "", note: "" });
      load();
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/payroll/adjustments/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("error", "Failed to delete");
    toast("success", "Adjustment removed");
    load();
    router.refresh();
  }

  const total = (list ?? []).reduce((s: number, a: any) => s + a.amount, 0);

  return (
    <Modal open={open} onClose={onClose} title={`Adjustments · ${month}`} size="md">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee" className="col-span-2">
            <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select employee…</option>
              {rows.map((r) => (
                <option key={r.employee.id} value={r.employee.id}>
                  {r.employee.firstName} {r.employee.lastName} ({r.employee.employeeNumber})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="arrears">Arrears</option>
              <option value="bonus">Bonus / incentive</option>
              <option value="deduction">Deduction</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Label" hint="e.g. Dec revision arrears">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label" />
          </Field>
          <Field label="Amount (₹)" hint="Negative = deduction">
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 5000 or -2000" />
          </Field>
          <Field label="Note (optional)">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        <Button onClick={create} loading={saving} className="w-full">
          <Plus className="h-4 w-4" /> Add adjustment
        </Button>

        <div>
          <p className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>For {month}</span>
            <span className="font-mono text-foreground">net {formatMoney(total)}</span>
          </p>
          {list === null ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">No adjustments yet for this month.</p>
          ) : (
            <div className="divide-y divide-white/[0.04] rounded-xl border border-edge">
              {list.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{a.label}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {a.employee?.firstName} {a.employee?.lastName} · {a.type}
                    </p>
                  </div>
                  <span className={`font-mono text-[13px] ${a.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {a.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(a.amount))}
                  </span>
                  <button onClick={() => remove(a.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-tint hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
