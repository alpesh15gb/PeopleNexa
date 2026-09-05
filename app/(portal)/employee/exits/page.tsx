"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Ban, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { StatusPill } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

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
    finalAmount: number;
  } | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function EmployeeExitsPage() {
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    const res = await fetch("/api/exits");
    const data = await res.json();
    if (res.ok) setRequests(data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const open = requests.find((r) => ["pending", "approved"].includes(r.status));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
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
        toast("error", data.error ?? "Failed to submit");
        return;
      }
      toast("success", "Exit request submitted — HR has been notified");
      e.currentTarget.reset();
      await load();
      router.refresh();
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-brand text-white">
          <DoorOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight">Exit &amp; Full &amp; Final</h1>
          <p className="text-[13px] text-muted-foreground">Resignation, notice period and your final settlement</p>
        </div>
      </div>

      {open ? (
        <div className="card-surface rounded-2xl border border-edge p-6">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-semibold">Your exit request</p>
            <StatusPill status={open.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{open.reason}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-tint px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Resigned on</p>
              <p className="mt-0.5 font-mono text-[14px] font-semibold">{formatDate(new Date(open.resignationDate))}</p>
            </div>
            <div className="rounded-xl bg-tint px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last working day</p>
              <p className="mt-0.5 font-mono text-[14px] font-semibold">{formatDate(new Date(open.lastWorkingDay))}</p>
            </div>
          </div>
          {open.note && (
            <p className="mt-4 rounded-xl border border-edge bg-card-2 px-4 py-3 text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">HR note: </span>{open.note}
            </p>
          )}
          {open.status === "pending" && (
            <Button size="sm" variant="outline" className="mt-4 text-rose-300" onClick={() => setConfirmCancel(true)}>
              <Ban className="h-3.5 w-3.5" /> Cancel request
            </Button>
          )}
        </div>
      ) : (
        <div className="card-surface rounded-2xl border border-edge p-6">
          <p className="font-display text-[15px] font-semibold">Raise an exit request</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Share your resignation date and intended last working day — HR reviews it and computes your full &amp; final.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Reason for leaving">
              <Textarea name="reason" required placeholder="e.g. Better opportunity, relocation, higher studies…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Resignation date">
                <Input name="resignationDate" type="date" required max={today} />
              </Field>
              <Field label="Last working day" hint="Typically 30 days after resignation">
                <Input name="lastWorkingDay" type="date" required min={today} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>Submit exit request</Button>
            </div>
          </form>
        </div>
      )}

      {requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="card-surface rounded-2xl border border-edge p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <p className="font-display text-[14px] font-semibold">
                    {formatDate(new Date(r.resignationDate))} → {formatDate(new Date(r.lastWorkingDay))}
                  </p>
                  <StatusPill status={r.status} />
                </div>
                <p className="text-[12px] text-muted-foreground">{r.reason}</p>
              </div>
              {r.fAndF && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-edge bg-card-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Earned salary ({r.fAndF.earnedDays}d)</p>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold">{inr(r.fAndF.earnedSalary)}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Notice shortfall ({r.fAndF.noticeShortfallDays}d)</p>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-rose-300">−{inr(r.fAndF.noticeDeduction)}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Loan recovery</p>
                    <p className="mt-0.5 font-mono text-[14px] font-semibold text-rose-300">−{inr(r.fAndF.loanOutstanding)}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Final settlement</p>
                    <p className="mt-0.5 font-mono text-[16px] font-bold text-emerald-300">{inr(r.fAndF.finalAmount)}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && requests.length === 0 && !open && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <PartyPopper className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">No exit requests yet.</p>
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
