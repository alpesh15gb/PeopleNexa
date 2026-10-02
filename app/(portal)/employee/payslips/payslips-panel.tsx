"use client";

import { useState } from "react";
import { Eye, Banknote, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/stat";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

interface Payslip {
  id: string;
  month: string;
  status: string;
  document: {
    days: { payable: number; paid: number; lop: number };
    components: {
      label: string;
      category: string;
      earned: number;
      visibleOnPayslip: boolean;
    }[];
    totals: { gross: number; deductions: number; net: number };
  };
}

export function PayslipsPanel({
  payslips,
  name,
  lang = "en",
}: {
  payslips: Payslip[];
  name: string;
  lang?: Lang;
}) {
  const [viewing, setViewing] = useState<Payslip | null>(null);
  const [year, setYear] = useState("all");
  const sorted = [...payslips].sort((a, b) => b.month.localeCompare(a.month));
  const visible = sorted.filter(
    (p) => year === "all" || p.month.startsWith(year),
  );
  const latest = sorted[0];
  const download = (p: Payslip) => {
    window.location.href = `/api/payroll/payslips?id=${encodeURIComponent(p.id)}&month=${encodeURIComponent(p.month)}`;
  };

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
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Latest payslip · {latest.month}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {formatMoney(latest.document.totals.net)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(lang, "payslips.netPay")} ·{" "}
            {latest.status === "paid"
              ? t(lang, "payslips.disbursed")
              : "Finalized · payment pending"}
          </p>
        </div>
        <Button variant="outline" onClick={() => download(latest)}>
          <Download aria-hidden="true" className="h-4 w-4" />
          Download PDF
        </Button>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h2 className="font-semibold">Payslip history</h2>
        <Field label="Year">
          <Select
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="all">All years</option>
            {[...new Set(sorted.map((p) => p.month.slice(0, 4)))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </Select>
        </Field>
      </div>
      <div className="hidden md:block">
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
            {visible.map((p) => (
              <TR key={p.id}>
                <TD className="tabular-nums text-[13px] font-medium">{p.month}</TD>
                <TD className="text-right tabular-nums text-[13px]">
                  {formatMoney(p.document.totals.gross)}
                </TD>
                <TD className="text-right tabular-nums text-[13px] font-semibold">
                  {formatMoney(p.document.totals.net)}
                </TD>
                <TD>
                  <StatusPill status={p.status} lang={lang} />
                </TD>
                <TD>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewing(p)}
                    >
                      <Eye className="h-3.5 w-3.5" /> {t(lang, "payslips.view")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Download payslip ${p.month}`}
                      onClick={() => download(p)}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      <div className="divide-y divide-edge md:hidden">
        {visible.map((p) => (
          <article key={p.id} className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{p.month}</h3>
              <StatusPill status={p.status} lang={lang} />
            </div>
            <p className="mt-3 text-2xl font-semibold">
              {formatMoney(p.document.totals.net)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(lang, "payslips.netPay")} · Gross{" "}
              {formatMoney(p.document.totals.gross)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                <Eye aria-hidden="true" className="h-4 w-4" />
                {t(lang, "payslips.view")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => download(p)}>
                <Download aria-hidden="true" className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No payslips for this year.
        </p>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={`Payslip · ${viewing?.month ?? ""}`}
        size="sm"
      >
        {viewing && (
          <div>
            <div className="flex items-center justify-between border-b border-edge pb-4">
              <div>
                <p className="font-display text-[15px] font-semibold">{name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {t(lang, "payslips.statement")}
                </p>
              </div>
              <StatusPill status={viewing.status} lang={lang} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md bg-tint px-2 py-0.5">
                {viewing.document.days.paid} paid days
              </span>
              {viewing.document.days.lop > 0 && (
                <span className="rounded-md bg-tint px-2 py-0.5">
                  {viewing.document.days.lop} LOP days
                </span>
              )}
            </div>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Earnings
            </h3>
            <div className="divide-y divide-[color:var(--border)]">
              {[
                ...viewing.document.components.filter(
                  (component) =>
                    component.category === "earning" &&
                    component.visibleOnPayslip,
                ),
                {
                  label: "Gross earnings",
                  earned: viewing.document.totals.gross,
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between py-2.5 text-[13.5px]"
                >
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(r.earned)}
                  </span>
                </div>
              ))}
            </div>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Deductions
            </h3>
            <div className="mt-1 divide-y divide-[color:var(--border)] border-t border-edge pt-1">
              {viewing.document.components
                .filter(
                  (component) =>
                    component.category === "deduction" &&
                    component.visibleOnPayslip &&
                    component.earned > 0,
                )
                .map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between py-2.5 text-[13.5px]"
                  >
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="tabular-nums font-medium">
                      − {formatMoney(r.earned)}
                    </span>
                  </div>
                ))}
              <div className="flex items-center justify-between py-2 text-sm">
                <span>Total deductions</span>
                <span className="tabular-nums">
                  {formatMoney(viewing.document.totals.deductions)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="font-display text-sm font-semibold">
                  {t(lang, "payslips.netPay")}
                </span>
                <span className="font-display text-lg font-bold text-indigo-300">
                  {formatMoney(viewing.document.totals.net)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/5 px-3.5 py-2.5 text-[12.5px] text-emerald-300">
              <Banknote className="h-4 w-4" />
              {viewing.status === "paid"
                ? t(lang, "payslips.disbursed")
                : "Finalized · payment pending"}
            </div>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => {
                window.location.href = `/api/payroll/payslips?id=${encodeURIComponent(viewing.id)}&month=${encodeURIComponent(viewing.month)}`;
              }}
            >
              <Download className="h-4 w-4" /> Download official PDF
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
