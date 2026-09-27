"use client";

import { useState } from "react";
import { Eye, Banknote, FileText, Download } from "lucide-react";
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
  status: string;
  document: { days: { payable: number; paid: number; lop: number }; components: { label: string; category: string; earned: number; visibleOnPayslip: boolean }[]; totals: { gross: number; deductions: number; net: number } };
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
               <TD className="text-right font-mono text-[13px]">{formatMoney(p.document.totals.gross)}</TD>
               <TD className="text-right font-mono text-[13px] font-semibold">{formatMoney(p.document.totals.net)}</TD>
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
               <span className="rounded-md bg-tint px-2 py-0.5">{viewing.document.days.paid} paid days</span>
               {viewing.document.days.lop > 0 && <span className="rounded-md bg-tint px-2 py-0.5">{viewing.document.days.lop} LOP days</span>}
            </div>
            <div className="divide-y divide-[color:var(--border)]">
               {[...viewing.document.components.filter((component) => component.category === "earning" && component.visibleOnPayslip), { label: "Gross earnings", earned: viewing.document.totals.gross }].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  <span className="text-muted-foreground">{r.label}</span>
                   <span className="font-mono font-medium">{formatMoney(r.earned)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 divide-y divide-[color:var(--border)] border-t border-edge pt-1">
               {viewing.document.components.filter((component) => component.category === "deduction" && component.visibleOnPayslip && component.earned > 0)
                 .map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 text-[13.5px]">
                    <span className="text-muted-foreground">{r.label}</span>
                   <span className="font-mono font-medium">− {formatMoney(r.earned)}</span>
                  </div>
                ))}
              <div className="flex items-center justify-between py-3">
                <span className="font-display text-sm font-semibold">{t(lang, "payslips.netPay")}</span>
                 <span className="font-display text-lg font-bold text-indigo-300">{formatMoney(viewing.document.totals.net)}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3.5 py-2.5 text-[12.5px] text-emerald-300">
              <Banknote className="h-4 w-4" />
              {viewing.status === "paid" ? t(lang, "payslips.disbursed") : t(lang, "payslips.draft")}
            </div>
            <Button className="mt-3 w-full" variant="outline" onClick={() => { window.location.href = `/api/payroll/payslips?id=${encodeURIComponent(viewing.id)}&month=${encodeURIComponent(viewing.month)}`; }}>
              <Download className="h-4 w-4" /> Download official PDF
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
