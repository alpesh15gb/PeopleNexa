"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { StatusPill } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import { DEFAULT_WORKSPACE_REGION, formatRegionalMoney, type WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate } from "@/lib/workspace-time";
import { PageHeader } from "@/components/ui/card";

interface ExitRequest {
  id: string;
  reason: string;
  resignationDate: string;
  lastWorkingDay: string;
  status: string;
  note: string | null;
  fAndF: {
    grossMonthly: number;
    perDay: number;
    earnedDays: number;
    earnedSalary: number;
    noticeDaysGiven: number;
    noticeShortfallDays: number;
    noticeDeduction: number;
    loanOutstanding: number;
    encashmentDays?: number;
    encashmentAmount?: number;
    finalAmount: number;
  } | null;
}

export default function EmployeeExitsPage() {
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [region, setRegion] = useState<WorkspaceRegion>(DEFAULT_WORKSPACE_REGION);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [formError, setFormError] = useState("");
  const [resigned, setResigned] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/exits?scope=self");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load exit requests.");
      setRequests(data.requests ?? []);
      if (data.region) setRegion(data.region);
      setLoadError("");
    } catch {
      setLoadError("Could not load your exit requests. Try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const open = requests.find((r) => ["pending", "approved"].includes(r.status));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    setSaving(true);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      const res = await fetch("/api/exits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: form.get("reason"),
          resignationDate: form.get("resignationDate"),
          lastWorkingDay: form.get("lastWorkingDay"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Could not submit the exit request.");
        return;
      }
      toast("success", "Exit request submitted for HR review.");
      formElement.reset();
      setResigned("");
      await load();
      router.refresh();
    } catch {
      setFormError("Could not submit the exit request. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setCancelling(true);
    try {
      const res = await fetch(`/api/exits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to cancel");
        return;
      }
      toast("success", "Exit request cancelled");
      setConfirmCancel(false);
      await load();
    } catch {
      toast("error", "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  }

  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const displayDate = (value: string) => formatCalendarDate(istDateKey(new Date(value)), region.locale);
  const money = (value: number) => formatRegionalMoney(value, region);
  const history = requests.filter((request) => request.id !== open?.id);
  function settlementDetails(settlement: NonNullable<ExitRequest["fAndF"]>) {
    return <dl className="mt-4 grid gap-3 rounded-xl border border-edge bg-card-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Earned salary ({settlement.earnedDays} days)</dt><dd className="font-semibold">{money(settlement.earnedSalary)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Notice deduction ({settlement.noticeShortfallDays} days)</dt><dd className="font-semibold">{money(settlement.noticeDeduction)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Loan recovery</dt><dd className="font-semibold">{money(settlement.loanOutstanding)}</dd></div>
      {Boolean(settlement.encashmentAmount) && <div><dt className="text-xs text-muted-foreground">Leave encashment ({settlement.encashmentDays} days)</dt><dd className="font-semibold">{money(settlement.encashmentAmount!)}</dd></div>}
      <div><dt className="text-xs text-muted-foreground">Settlement amount</dt><dd className="font-semibold">{money(settlement.finalAmount)}</dd></div>
    </dl>;
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="My exit requests" description="Submit a resignation, follow the notice period, and see any settlement prepared by HR." />

      {loading && <p role="status" className="text-sm text-muted-foreground">Loading exit requests…</p>}
      {loadError && <div className="flex items-center gap-3 text-sm"><p role="alert" className="text-destructive">{loadError}</p><Button size="sm" variant="outline" onClick={load}>Retry requests</Button></div>}
      {open ? (
        <div className="card-surface rounded-2xl border border-edge p-6">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-semibold">Your exit request</p>
            <StatusPill status={open.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{open.reason}</p>
          <p className="mt-2 text-sm text-muted-foreground">{open.status === "pending" ? "Awaiting HR review. You can withdraw the request while it is pending." : "HR approved your resignation. Contact HR if your last working day changes."}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-tint px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Resigned on</p>
              <p className="mt-0.5 font-mono text-[14px] font-semibold">{displayDate(open.resignationDate)}</p>
            </div>
            <div className="rounded-xl bg-tint px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last working day</p>
              <p className="mt-0.5 font-mono text-[14px] font-semibold">{displayDate(open.lastWorkingDay)}</p>
            </div>
          </div>
          {open.note && (
            <p className="mt-4 rounded-xl border border-edge bg-card-2 px-4 py-3 text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">HR note: </span>{open.note}
            </p>
          )}
          {open.fAndF && settlementDetails(open.fAndF)}
          {open.status === "pending" && (
            <Button size="sm" variant="outline" className="mt-4 text-rose-300" onClick={() => setConfirmCancel(true)}>
              <Ban className="h-3.5 w-3.5" /> Cancel request
            </Button>
          )}
        </div>
      ) : !loading && !loadError && (
        <div className="card-surface rounded-2xl border border-edge p-6">
          <h2 className="font-display text-base font-semibold">Submit a resignation</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            HR will review the requested dates and prepare your settlement if the request is approved.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Reason for leaving">
              <Textarea name="reason" required maxLength={2000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Resignation date">
                <Input name="resignationDate" type="date" required max={today} value={resigned} onChange={(event) => setResigned(event.target.value)} />
              </Field>
              <Field label="Proposed last working day" hint="Use the notice period in your employment terms.">
                <Input name="lastWorkingDay" type="date" min={resigned || undefined} required />
              </Field>
            </div>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>Submit exit request</Button>
            </div>
          </form>
        </div>
      )}

      {!loading && !loadError && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Request history</h2>
          {history.length === 0 && <p className="text-sm text-muted-foreground">Completed, cancelled, and rejected requests will appear here.</p>}
          {history.map((r) => (
            <div key={r.id} className="card-surface rounded-2xl border border-edge p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <p className="font-display text-[14px] font-semibold">
                    {displayDate(r.resignationDate)} → {displayDate(r.lastWorkingDay)}
                  </p>
                  <StatusPill status={r.status} />
                </div>
                <p className="text-[12px] text-muted-foreground">{r.reason}</p>
              </div>
              {r.note && <p className="mt-2 break-words text-sm text-muted-foreground">HR note · {r.note}</p>}
              {r.fAndF && settlementDetails(r.fAndF)}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel exit request?"
        description="Your resignation will be withdrawn. This can't be undone."
        confirmLabel="Cancel request"
        busy={cancelling}
        onCancel={() => !cancelling && setConfirmCancel(false)}
        onConfirm={() => open && cancel(open.id)}
      />
    </div>
  );
}
