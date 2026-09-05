"use client";

import { useState } from "react";
import { Eye, Banknote, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/stat";
import { formatMoney } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

interface Payslip {
  id: string;
  month: string;
  baseSalary: number;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  grossEarnings: number;
  pfEmployee: number;
  esicEmployee: number;
  professionalTax: number;
  lwf: number;
  tds: number;
  lateFines: number;
  loanDeduction: number;
  deductions: number;
  netSalary: number;
  status: string;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  overtimeHours: number;
  workedHours: number;
  adjustments: { label: string; amount: number }[] | null;
}

export function PayslipsPanel({ payslips, name, lang = "en" }: { payslips: Payslip[]; name: string; lang?: Lang }) {
  const [viewing, setViewing] = useState<Payslip | null>(null);

  if (payslips.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title={t(lang, "payslips.none")}
        description={t(lang, "payslips.noneDesc")}
      />
    );
  }

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>{t(lang, "payslips.month")}</TH>
            <TH className="text-right">{t(lang, "payslips.base")}</TH>
            <TH className="text-right">{t(lang, "payslips.netPay")}</TH>
            <TH>{t(lang, "payslips.status")}</TH>
            <TH className="w-20" />
          </TR>
        </THead>
        <TBody>
          {payslips.map((p) => (
            <TR key={p.id}>
              <TD className="font-mono text-[13px] font-medium">{p.month}</TD>
              <TD className="text-right font-mono text-[13px]">{formatMoney(p.basicSalary || p.baseSalary * 0.5)}</TD>
              <TD className="text-right font-mono text-[13px] font-semibold">{formatMoney(p.netSalary)}</TD>
              <TD><StatusPill status={p.status} lang={lang} /></TD>
              <TD>
                <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                  <Eye className="h-3.5 w-3.5" /> {t(lang, "payslips.view")}
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={`Payslip · ${viewing?.month ?? ""}`} size="sm">
        {viewing && (
          <div>
            <div className="flex items-center justify-between border-b border-edge pb-4">
              <div>
                <p className="font-display text-[15px] font-semibold">{name}</p>
                <p className="text-[12px] text-muted-foreground">{t(lang, "payslips.statement")}</p>
              </div>
              <StatusPill status={viewing.status} lang={lang} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md bg-tint px-2 py-0.5">{viewing.presentDays} present</span>
              {viewing.lateDays > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.lateDays} late</span>}
              {viewing.halfDays > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.halfDays} half day</span>}
              {viewing.absentDays > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.absentDays} absent</span>}
              {viewing.overtimeHours > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.overtimeHours}h OT</span>}
              {viewing.workedHours > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.workedHours}h worked</span>}
            </div>
            <div className="divide-y divide-[color:var(--border)]">
              {[
                { label: t(lang, "payslips.basic"), value: formatMoney(viewing.basicSalary || viewing.baseSalary * 0.5) },
                { label: t(lang, "payslips.allowances"), value: formatMoney(viewing.allowances) },
                ...(viewing.overtimePay > 0 ? [{ label: "Overtime", value: formatMoney(viewing.overtimePay) }] : []),
                ...(viewing.adjustments?.filter((a) => a.amount > 0).map((a) => ({ label: a.label, value: formatMoney(a.amount) })) ?? []),
                { label: "Gross earnings", value: formatMoney(viewing.grossEarnings) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-mono font-medium">{r.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 divide-y divide-[color:var(--border)] border-t border-edge pt-1">
              {[
                { label: "EPF (employee)", value: viewing.pfEmployee },
                { label: "ESIC (employee)", value: viewing.esicEmployee },
                { label: "Professional tax", value: viewing.professionalTax },
                ...(viewing.lwf > 0 ? [{ label: "LWF", value: viewing.lwf }] : []),
                { label: "TDS (income tax)", value: viewing.tds },
                { label: "Late fines", value: viewing.lateFines },
                { label: "Loan / advance", value: viewing.loanDeduction },
                ...(viewing.adjustments?.filter((a) => a.amount < 0).map((a) => ({ label: a.label, value: Math.abs(a.amount) })) ?? []),
              ]
                .filter((r) => r.value > 0)
                .map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 text-[13.5px]">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-mono font-medium">− {formatMoney(r.value)}</span>
                  </div>
                ))}
              <div className="flex items-center justify-between py-3">
                <span className="font-display text-sm font-semibold">{t(lang, "payslips.netPay")}</span>
                <span className="font-display text-lg font-bold text-indigo-300">{formatMoney(viewing.netSalary)}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3.5 py-2.5 text-[12.5px] text-emerald-300">
              <Banknote className="h-4 w-4" />
              {viewing.status === "paid" ? t(lang, "payslips.disbursed") : t(lang, "payslips.draft")}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
