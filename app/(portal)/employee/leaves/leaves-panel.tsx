"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import { formatCalendarDate } from "@/lib/workspace-time";
import { t, type Lang } from "@/lib/i18n";
import type { LeaveCancellationDecision } from "@/lib/leave-request-history";
import type { LeaveCalendarRules } from "@/lib/leave-calendar";

interface BalanceItem {
  id: string;
  name: string;
  code: string;
  color: string;
  opening: number;
  credited: number;
  used: number;
  pending: number;
  remaining: number | null;
  policyNote: string;
  policy: {
    requiresApproval: boolean;
    requiresReason: boolean;
    allowsHalfDay: boolean;
    dayCounting: NonNullable<LeaveCalendarRules["dayCounting"]> | "legacy";
    noticeDays: number;
    minServiceDays: number;
    maxConsecutiveDays: number | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  };
}

interface Req {
  cancellationRequestedBy?: string | null;
  cancellationReason?: string | null;
  cancellationDecision?: LeaveCancellationDecision;
  id: string;
  days: number;
  reason: string | null;
  status: string;
  fromDate: Date;
  toDate: Date;
  appliedAt: Date;
  reviewNote: string | null;
  source: string;
  leaveType: { name: string; color: string };
}

const dayCountingLabels: Record<BalanceItem["policy"]["dayCounting"], string> = {
  calendar_days: "Calendar days",
  working_days: "Working days",
  sandwich: "Working days and non-working days between them",
  legacy: "Calendar dates in the selected range",
};

export function LeavesPanel({
  balance,
  requests,
  lang = "en",
  locale,
  today,
  view,
  range,
  requestFilter,
  page,
  submittedRequest,
  canApply,
  openOnLoad,
}: {
  balance: BalanceItem[];
  requests: Req[];
  lang?: Lang;
  locale: string;
  today: string;
  view: "summary" | "requests";
  range: "upcoming" | "past" | "all";
  requestFilter: string;
  page: number;
  submittedRequest: Pick<Req, "id" | "fromDate" | "toDate" | "status" | "days" | "leaveType"> | null;
  canApply: boolean;
  openOnLoad: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [preview, setPreview] = useState<{
    input: string;
    data: { days: number; requiresReason: boolean; requiresApproval: boolean; dayCounting: BalanceItem["policy"]["dayCounting"] };
  } | { input: string; error: string } | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [formError, setFormError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [open, setOpen] = useState(openOnLoad && canApply);
  const [loading, setLoading] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState(balance[0]?.id ?? "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const leaveTypeField = useRef<HTMLSelectElement>(null);
  const nextLeave = view === "summary" ? requests : [];
  const visibleRequests = requests;
  function leaveHref(targetView: "summary" | "requests", nextRange = range, status = requestFilter, pageNumber = 1, submittedId?: string) {
    const params = new URLSearchParams();
    if (targetView === "requests") params.set("view", "requests");
    if (nextRange !== "all") params.set("range", nextRange);
    if (status !== "all") params.set("status", status);
    if (pageNumber > 1) params.set("page", String(pageNumber));
    if (submittedId) params.set("submitted", submittedId);
    return params.size ? `/employee/leaves?${params}` : "/employee/leaves";
  }
  const selectedBalance = balance.find((item) => item.id === selectedTypeId);
  const previewInput = new URLSearchParams({ from: fromDate, to: toDate, type: selectedTypeId, halfDay: String(halfDay) }).toString();
  const dateError =
    Boolean(fromDate && toDate && toDate < fromDate) ||
    Boolean(halfDay && fromDate && toDate && fromDate !== toDate);
  const needsEstimate = Boolean(open && fromDate && toDate && selectedTypeId && !dateError);
  const currentPreview = needsEstimate && preview?.input === previewInput ? preview : null;
  const activeEstimate = currentPreview && "data" in currentPreview ? currentPreview.data : null;
  const estimateError = currentPreview && "error" in currentPreview ? currentPreview.error : "";
  const estimating = needsEstimate && !currentPreview;
  const baseHref = leaveHref(view, range, requestFilter, page);

  function openApplication(typeId?: string) {
    if (typeId) setSelectedTypeId(typeId);
    setFormError("");
    setOpen(true);
  }

  function closeApplication() {
    setOpen(false);
    setFromDate("");
    setToDate("");
    setHalfDay(false);
    setFormError("");
    if (openOnLoad) router.replace(baseHref, { scroll: false });
  }

  function dateLabel(date: Date) {
    return formatCalendarDate(istDateKey(date), locale);
  }

  useEffect(() => {
    if (!needsEstimate) return;
    const controller = new AbortController();
    fetch(`/api/leaves/preview?${previewInput}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not estimate leave days.");
      if (!controller.signal.aborted) setPreview({ input: previewInput, data });
    }).catch((error) => {
      if (!controller.signal.aborted) setPreview({ input: previewInput, error: error instanceof Error ? error.message : "Could not estimate leave days." });
    });
    return () => controller.abort();
  }, [needsEstimate, previewInput, previewRetry]);
  const requestedDays = activeEstimate?.days ?? 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || !activeEstimate || activeEstimate.days <= 0 || dateError) return;
    setFormError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/leaves/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: form.get("leaveTypeId"),
          fromDate: form.get("fromDate"),
          toDate: form.get("toDate"),
          reason: form.get("reason"),
          halfDay,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Failed to apply for leave.");
        return;
      }
      toast(
        "success",
        data.request.status === "approved"
          ? t(lang, "leaves.autoApproved")
          : t(lang, "leaves.submitted"),
      );
      setOpen(false);
      setFromDate("");
      setToDate("");
      setHalfDay(false);
      const submittedHref = view === "requests"
        ? leaveHref("requests", range, requestFilter, page, data.request.id)
        : leaveHref("requests", "all", "all", 1, data.request.id);
      if (openOnLoad) router.replace(submittedHref, { scroll: false });
      else router.push(submittedHref, { scroll: false });
      router.refresh();
    } catch {
      setFormError("Could not send your request. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function withdraw(id: string, reason?: string) {
    if (loading) return;
    setCancelError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/leaves/requests/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error ?? "Could not update the leave request.";
        if (reason) setCancelError(message);
        else toast("error", message);
        return;
      }
      toast("success", data.status === "cancellation_pending" ? "Cancellation sent for independent approval. Your leave remains approved until review." : "Leave request withdrawn.");
      setCancelId(null); setWithdrawId(null); setCancelReason("");
      router.refresh();
    } catch {
      if (reason) setCancelError("Could not send the cancellation. Try again.");
      else toast("error", "Could not withdraw the request. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge">
        <nav aria-label="My leave views" className="flex gap-6 text-sm">
          <Link href={leaveHref("summary", range, requestFilter, page)} aria-current={view === "summary" ? "page" : undefined} className={`border-b-2 px-1 py-3 font-medium ${view === "summary" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Summary</Link>
          <Link href={leaveHref("requests", range, requestFilter, page)} aria-current={view === "requests" ? "page" : undefined} className={`border-b-2 px-1 py-3 font-medium ${view === "requests" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Requests</Link>
        </nav>
        <Button className="mb-2" onClick={() => openApplication()} disabled={!canApply}>
          <CalendarPlus aria-hidden="true" className="h-4 w-4" />{" "}
          {t(lang, "leaves.apply")}
        </Button>
      </div>
      {!canApply && balance.length > 0 && <p className="text-sm text-muted-foreground">Leave requests are available to staff accounts.</p>}
      {view === "summary" && <>
      <section aria-labelledby="leave-balances" className="space-y-3">
        <h2 id="leave-balances" className="font-display text-lg font-semibold">Leave balances</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {balance.map((b) => {
          const total =
            b.remaining === null
              ? 0
              : Math.max(0, b.remaining) + b.used + b.pending;
          const pct = total
            ? Math.min(100, Math.max(0, (b.used / total) * 100))
            : 0;
          const pendingPct = total
            ? Math.min(100 - pct, Math.max(0, (b.pending / total) * 100))
            : 0;
          return (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: b.color }}
                    />
                    {b.name}
                    <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      {b.code}
                    </span>
                  </p>
                  <p className="mt-2 font-display text-3xl font-bold tracking-tight">
                    {b.remaining === null ? "Unlimited" : b.remaining}
                    {b.remaining !== null && (
                      <span className="ml-1 text-sm font-medium text-muted-foreground">
                        days available
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="mt-4 flex h-2 overflow-hidden rounded-full bg-tint"
              >
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, background: b.color }}
                />
                <div
                  className="h-full bg-amber-400/60 transition-all"
                  style={{ width: `${pendingPct}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>{b.used} days used</span>
                <span>{b.pending} pending</span>
              </div>
              <details className="mt-3 border-t border-edge pt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring">
                  Balance and policy details
                </summary>
                <p className="mt-2">
                  Opening {b.opening} · Credited {b.credited}
                </p>
                <p className="mt-1">{b.policyNote}</p>
                {b.policy.effectiveFrom && <p className="mt-1">
                  Effective {formatCalendarDate(b.policy.effectiveFrom, locale)}{b.policy.effectiveTo ? ` through ${formatCalendarDate(b.policy.effectiveTo, locale)}` : ""}
                </p>}
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>{dayCountingLabels[b.policy.dayCounting]}</li>
                  <li>{b.policy.requiresApproval ? "Requires approval" : "Automatically approved when eligible"}</li>
                  {b.policy.requiresReason && <li>Reason required</li>}
                  {b.policy.allowsHalfDay && <li>Half days allowed</li>}
                  {b.policy.noticeDays > 0 && <li>Apply at least {b.policy.noticeDays} days in advance</li>}
                  {b.policy.minServiceDays > 0 && <li>{b.policy.minServiceDays} days of service required</li>}
                  {b.policy.maxConsecutiveDays !== null && <li>{b.policy.maxConsecutiveDays} days per request maximum</li>}
                </ul>
              </details>
              {canApply && <Button aria-label={`Apply for ${b.name}`} variant="outline" size="sm" className="mt-4" onClick={() => openApplication(b.id)}>Apply</Button>}
            </Card>
          );
        })}
        </div>

      {balance.length === 0 && (
        <p className="rounded-xl border border-edge bg-card p-5 text-sm text-muted-foreground">
          No leave types are available yet. Contact your administrator to set up
          your leave allowance.
        </p>
      )}
      </section>

      <Card>
        <CardHeader className="flex-wrap items-center">
          <CardTitle>Current and upcoming leave</CardTitle>
          <Link href="/employee/leaves?view=requests&range=upcoming" className="text-sm font-medium text-primary underline-offset-4 hover:underline">View requests</Link>
        </CardHeader>
        <CardContent className="pt-3">
          {nextLeave.length ? <ul className="divide-y divide-edge">
            {nextLeave.map((request) => <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><p className="font-medium">{request.leaveType.name}</p><p className="text-sm text-muted-foreground">{dateLabel(request.fromDate)} – {dateLabel(request.toDate)}</p></div>
              <StatusPill status={request.status} lang={lang} />
            </li>)}
          </ul> : <p className="py-3 text-sm text-muted-foreground">You have no current or upcoming approved or pending leave.</p>}
        </CardContent>
      </Card>
      </>}

      {submittedRequest && <section aria-labelledby="submitted-leave-title" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="min-w-0 flex-1">
          <h2 id="submitted-leave-title" className="text-sm font-semibold">Submitted request</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {submittedRequest.leaveType.name} · {dateLabel(submittedRequest.fromDate)}{istDateKey(submittedRequest.toDate) !== istDateKey(submittedRequest.fromDate) && ` – ${dateLabel(submittedRequest.toDate)}`}
          </p>
        </div>
        <StatusPill status={submittedRequest.status} lang={lang} />
        <Link href={baseHref} replace scroll={false} className="rounded-lg px-3 py-2 text-sm text-primary hover:bg-tint">Dismiss</Link>
      </section>}
      {view === "requests" && <Card>
        <CardHeader className="flex-wrap items-end">
          <div>
            <CardTitle>{t(lang, "leaves.myRequests")}</CardTitle>
            <CardDescription>
              Follow the status of your own applications.
            </CardDescription>
          </div>
          <Select
            aria-label="Filter my leave requests"
            className="w-auto min-w-36"
            value={requestFilter}
            onChange={(event) => router.push(leaveHref("requests", range, event.target.value), { scroll: false })}
          >
            <option value="all">All statuses</option>
            <option value="awaiting_review">Awaiting review (leave and cancellations)</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancellation_pending">Cancellation awaiting review</option>
            <option value="cancelled">Cancelled or withdrawn</option>
          </Select>
        </CardHeader>
        <CardContent className="pt-4">
          <nav aria-label="Leave request dates" className="mb-3 flex flex-wrap gap-2">
            {([ ["upcoming", "Current and upcoming"], ["past", "Past"], ["all", "All dates"] ] as const).map(([key, label]) => (
              <Link key={key} href={leaveHref("requests", key)} aria-current={range === key ? "page" : undefined} className={`rounded-lg border border-edge px-3 py-2 text-sm ${range === key ? "bg-primary/10 font-semibold text-primary" : "hover:bg-tint"}`}>
                {label}
              </Link>
            ))}
          </nav>
          {visibleRequests.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {range !== "all" || requestFilter !== "all" ? "No requests match the selected dates and status." : t(lang, "common.noLeaveRequests")}
            </p>
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {visibleRequests.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span
                    className="mt-1.5 h-2.5 w-2.5 rounded-full sm:mt-0"
                    style={{ background: r.leaveType.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">
                      {r.leaveType.name} ·{" "}
                      {r.days > 1
                        ? t(lang, "leaves.days", { n: r.days })
                        : t(lang, "leaves.day", { n: r.days })}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {dateLabel(r.fromDate)}{istDateKey(r.fromDate) !== istDateKey(r.toDate) && ` – ${dateLabel(r.toDate)}`}
                      {r.source === "admin_on_behalf"
                        ? " · Recorded on your behalf"
                        : ""}
                    </p>
                    {r.reason && <p className="break-words text-xs text-muted-foreground">{r.reason}</p>}
                    {r.reviewNote && <p className="mt-1 break-words text-xs text-muted-foreground">Review note · {r.reviewNote}</p>}
                    {r.cancellationRequestedBy && r.cancellationReason && <p className="mt-1 break-words text-xs text-muted-foreground">Cancellation reason · {r.cancellationReason}</p>}
                    {!r.cancellationRequestedBy && r.cancellationDecision && <p className="mt-1 break-words text-xs text-muted-foreground">
                      {r.cancellationDecision.approved ? "Cancellation approved" : "Cancellation declined. Leave remains approved."}{r.cancellationDecision.note && ` · ${r.cancellationDecision.note}`}
                    </p>}
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end">
                    {r.status === "cancelled" && !r.cancellationDecision ? <span className="rounded-full bg-tint px-2 py-1 text-xs">Withdrawn</span> : <StatusPill status={r.status} lang={lang} />}
                    {r.cancellationRequestedBy && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Cancellation awaiting review</span>}
                    {r.status === "approved" && !r.cancellationRequestedBy && <Button size="sm" variant="outline" disabled={loading} onClick={() => { setCancelId(r.id); setCancelReason(""); setCancelError(""); }}>Request cancellation</Button>}
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => setWithdrawId(r.id)}
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      <ConfirmDialog open={withdrawId !== null} onCancel={() => !loading && setWithdrawId(null)} onConfirm={() => withdrawId && withdraw(withdrawId)} busy={loading} title="Withdraw this request?" description="This removes the pending request from the approval queue." confirmLabel="Withdraw request" />
      <Modal open={cancelId !== null} onClose={() => !loading && setCancelId(null)} title="Request leave cancellation">
        <div className="space-y-4"><p className="text-sm text-muted-foreground">Approved leave remains in effect until an independent reviewer approves this cancellation. Closed payroll must be handled separately.</p>
          <Field label="Cancellation reason"><Textarea value={cancelReason} maxLength={2000} onChange={(event) => { setCancelReason(event.target.value); setCancelError(""); }} /></Field>
          {cancelError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{cancelError}</p>}
          <Button loading={loading} disabled={!cancelReason.trim()} onClick={() => cancelId && withdraw(cancelId, cancelReason)}>Send for review</Button>
        </div>
      </Modal>
      <Modal
        open={open}
        onClose={() => !loading && closeApplication()}
        title={t(lang, "leaves.apply")}
        size="sm"
        initialFocus={leaveTypeField}
      >
        <form onSubmit={onSubmit} onChange={() => formError && setFormError("")} className="space-y-4">
          <Field label={t(lang, "leaves.leaveType")}>
            <Select
              ref={leaveTypeField}
              name="leaveTypeId"
              required
              value={selectedTypeId}
              onChange={(event) => { setSelectedTypeId(event.target.value); setPreview(null); }}
            >
              {balance.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (
                  {b.remaining === null ? "unlimited" : `${b.remaining} currently available`}
                  )
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t(lang, "leaves.from")}>
              <Input
                name="fromDate"
                type="date"
                required
                value={fromDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setFromDate(value);
                  setPreview(null);
                  if (halfDay || !toDate || toDate < value) setToDate(value);
                }}
                aria-invalid={dateError}
              />
            </Field>
            <Field label={t(lang, "leaves.to")}>
              <Input
                name="toDate"
                type="date"
                required
                value={toDate}
                min={fromDate || undefined}
                max={halfDay ? fromDate || undefined : undefined}
                onChange={(event) => { setToDate(event.target.value); setPreview(null); }}
                aria-invalid={dateError}
              />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={halfDay}
              onChange={(event) => {
                setHalfDay(event.target.checked);
                setPreview(null);
                if (event.target.checked && fromDate) setToDate(fromDate);
              }}
              className="h-4 w-4 accent-indigo-500"
            />
            Half day (single date only, when the active policy permits it)
          </label>
          {dateError && (
            <p role="alert" className="text-[12px] text-rose-300">
              Choose one date for a half day, or an end date on or after the start date for a full-day request.
            </p>
          )}
          {estimating && <p role="status" className="text-sm text-muted-foreground">Calculating days from your leave policy…</p>}
          {estimateError && <div className="rounded-lg border border-edge p-3">
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{estimateError}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => { setPreview(null); setPreviewRetry((value) => value + 1); }}>Recheck dates</Button>
          </div>}
          {selectedBalance &&
            activeEstimate &&
            requestedDays > 0 &&
            !dateError && (
              <p className="rounded-lg border border-edge bg-tint px-3 py-2 text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{requestedDays === 1 ? "1 day requested" : `${requestedDays} days requested`}</span> · {dayCountingLabels[activeEstimate.dayCounting]}.
                {" "}{activeEstimate.requiresApproval ? "Sent for approval." : "Automatically approved when eligible."} Your balance is checked on submission.
              </p>
            )}
          <Field label={activeEstimate?.requiresReason ? `${t(lang, "leaves.reason")} (required)` : t(lang, "leaves.reason")}>
            <Textarea
              required={activeEstimate?.requiresReason}
              maxLength={2000}
              name="reason"
              placeholder={activeEstimate?.requiresReason ? undefined : t(lang, "leaves.reasonPlaceholder")}
            />
          </Field>
          {formError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={closeApplication}
            >
              {t(lang, "common.cancel")}
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={estimating || !activeEstimate || requestedDays <= 0 || Boolean(estimateError) || dateError}
            >
              {t(lang, "leaves.submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
