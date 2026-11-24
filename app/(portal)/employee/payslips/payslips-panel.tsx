"use client";

import { useState } from "react";
import { ArrowUpRight, Banknote, Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/stat";
import type { PayslipComponent, PayslipDocumentSnapshot } from "@/lib/payslip-document";
import { t, type Lang } from "@/lib/i18n";

interface Payslip {
  id: string;
  month: string;
  status: string;
  totals: PayslipDocumentSnapshot["totals"];
  details: { name: string; days: PayslipDocumentSnapshot["days"]; components: PayslipComponent[] } | null;
}

const states = {
  finalized: { label: "Payment pending", tone: "info", explanation: "Your payslip is ready. Payroll has yet to record payment." },
  paid: { label: "Paid", tone: "success", explanation: "Payroll has recorded payment." },
  reversed: { label: "Reversed", tone: "warning", explanation: "Payroll reversed this statement. Check this period for a replacement or contact payroll." },
} as const;

function statementState(status: string) {
  return states[status as keyof typeof states] ?? states.finalized;
}

export function PayslipsPanel({ payslips, locale, lang = "en" }: { payslips: Payslip[]; locale: string; lang?: Lang }) {
  const [viewing, setViewing] = useState<Payslip | null>(null);
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "INR" });
  const periodFormatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = (month: string) => {
    const date = new Date(month + "-01T00:00:00Z");
    return Number.isNaN(date.getTime()) ? month : periodFormatter.format(date);
  };
  const money = (value: number) => formatter.format(value);
  const latest = payslips.find(({ status }) => status !== "reversed") ?? payslips[0];
  const years = [...new Set(payslips.map(({ month }) => month.slice(0, 4)))];
  const statuses = [...new Set(payslips.map((payslip) => payslip.status))];
  const visible = payslips.filter((item) => (year === "all" || item.month.startsWith(year + "-")) && (status === "all" || item.status === status));

  async function download(payslip: Payslip) {
    if (downloading || payslip.status === "reversed") return;
    setDownloading(payslip.id);
    setDownloadError("");
    try {
      const params = new URLSearchParams({ scope: "personal", id: payslip.id, month: payslip.month });
      const response = await fetch("/api/payroll/payslips?" + params);
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/pdf")) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Could not download this payslip. Try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "payslip-" + payslip.month + ".pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not download this payslip. Try again.");
    } finally {
      setDownloading(null);
    }
  }

  function openDetails(payslip: Payslip) {
    setDownloadError("");
    setViewing(payslip);
  }

  if (!latest) {
    return (
      <Card>
        <EmptyState icon={<FileText className="size-5" />} title={t(lang, "payslips.none")} description="Your payslip appears here when payroll finalizes it. Contact your payroll team if a statement is missing." />
      </Card>
    );
  }

  const latestState = statementState(latest.status);
  const { net, deductions } = latest.totals;
  const distributed = net + deductions;
  const drawBreakdown = Number.isFinite(distributed) && distributed > 0 && net >= 0 && deductions >= 0;
  return (
    <>
      <section aria-labelledby="latest-payslip" className="rounded-xl border border-edge bg-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="latest-payslip" className="font-semibold">{monthLabel(latest.month)} payslip</h2>
              <Badge tone={latestState.tone}>{latestState.label}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{latestState.explanation}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latest.status !== "reversed" && <Button onClick={() => download(latest)} loading={downloading === latest.id} disabled={downloading !== null}>
              <Download aria-hidden="true" className="size-4" /> Download PDF
            </Button>}
            <Button variant={latest.status === "reversed" ? "primary" : "outline"} onClick={() => openDetails(latest)}>View details <ArrowUpRight aria-hidden="true" className="size-4" /></Button>
          </div>
        </div>
        <section aria-labelledby="latest-breakdown" className="border-t border-edge px-5 py-4 sm:px-6">
          <h3 id="latest-breakdown" className="mb-3 text-sm font-semibold">Pay breakdown</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{latest.status === "reversed" ? "Original net pay" : t(lang, "payslips.netPay")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{money(net)}</dd>
            </div>
            <div><dt className="text-muted-foreground">Gross pay</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{money(latest.totals.gross)}</dd></div>
            <div><dt className="text-muted-foreground">Deductions</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{money(deductions)}</dd></div>
          </dl>
          {drawBreakdown && <div aria-hidden="true" className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-tint">
            <span className="bg-primary" style={{ width: `${net / distributed * 100}%` }} />
            <span className="bg-amber-500" style={{ width: `${deductions / distributed * 100}%` }} />
          </div>}
          {drawBreakdown && <div aria-hidden="true" className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" /> Net pay</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-500" /> Deductions</span>
          </div>}
          {downloadError && !viewing && <p role="alert" className="mt-3 text-sm text-destructive">{downloadError}</p>}
        </section>
      </section>
      <Card aria-labelledby="payslip-history">
        <CardHeader className="flex-wrap">
          <h2 id="payslip-history" className="font-semibold">Payslip history</h2>
          {years.length > 1 && <Field label="Year">
            <Select aria-label="Payslip year" value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="all">All years</option>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>}
          {statuses.length > 1 && <Field label="Status">
            <Select aria-label="Payslip status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              {statuses.map((value) => <option key={value} value={value}>{statementState(value).label}</option>)}
            </Select>
          </Field>}
        </CardHeader>
        <CardContent className="pt-2">
          {visible.length === 0 && <p role="status" className="py-4 text-sm text-muted-foreground">No payslips match these filters. <button type="button" className="font-medium text-primary underline" onClick={() => { setYear("all"); setStatus("all"); }}>Clear filters</button></p>}
          <ul className="divide-y divide-edge">
            {visible.map((payslip) => (
              <li key={payslip.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(9rem,1.1fr)_minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <h3 className="mb-1 font-medium">{monthLabel(payslip.month)}</h3>
                  <Badge tone={statementState(payslip.status).tone}>{statementState(payslip.status).label}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm tabular-nums">
                  <div><dt className="text-xs text-muted-foreground">Gross pay</dt><dd>{money(payslip.totals.gross)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{payslip.status === "reversed" ? "Original net pay" : t(lang, "payslips.netPay")}</dt><dd className="font-semibold">{money(payslip.totals.net)}</dd></div>
                </dl>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label={"View payslip for " + monthLabel(payslip.month)} onClick={() => openDetails(payslip)}>View</Button>
                  {payslip.status !== "reversed" && <Button size="sm" variant="ghost" aria-label={"Download payslip for " + monthLabel(payslip.month)} onClick={() => download(payslip)} loading={downloading === payslip.id} disabled={downloading !== null}><Download aria-hidden="true" className="size-4" /> PDF</Button>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Modal open={viewing !== null} onClose={() => { setViewing(null); setDownloadError(""); }} title={viewing ? monthLabel(viewing.month) + " payslip" : ""} placement="drawer" size="md">
        {viewing && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-lg bg-tint px-3 py-2.5 text-sm">
              <Banknote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{statementState(viewing.status).explanation}</p>
            </div>
            {viewing.details ? (
              <>
                <div>
                  <p className="font-medium">{viewing.details.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{viewing.details.days.paid} paid days{viewing.details.days.lop > 0 ? " · " + viewing.details.days.lop + " unpaid days" : ""}</p>
                </div>
                {viewing.details.components.length > 0 && (
                  <dl className="divide-y divide-edge border-y border-edge">
                    {viewing.details.components.map((component) => (
                      <div key={component.code} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                        <dt>{component.label}</dt>
                        <dd className="shrink-0 tabular-nums">{money(component.category === "deduction" ? -component.earned : component.earned)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground">This older statement shows the totals recorded at the time.{viewing.status !== "reversed" && " The PDF contains the available breakdown."}</p>}
            <dl className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between gap-3"><dt>Gross pay</dt><dd>{money(viewing.totals.gross)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Total deductions</dt><dd>{money(viewing.totals.deductions)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-edge pt-2 text-base font-semibold"><dt>{viewing.status === "reversed" ? "Original net pay" : t(lang, "payslips.netPay")}</dt><dd>{money(viewing.totals.net)}</dd></div>
            </dl>
            {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
            {viewing.status !== "reversed" && <Button variant="outline" className="w-full" onClick={() => download(viewing)} loading={downloading === viewing.id} disabled={downloading !== null}><Download aria-hidden="true" className="size-4" /> Download PDF</Button>}
          </div>
        )}
      </Modal>
    </>
  );
}
