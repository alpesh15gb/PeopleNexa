"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { t, type Lang } from "@/lib/i18n";

interface BalanceItem {
  id: string;
  name: string;
  code: string;
  maxDays: number;
  color: string;
  used: number;
  remaining: number;
}

interface Req {
  id: string;
  days: number;
  reason: string | null;
  status: string;
  fromDate: Date;
  toDate: Date;
  appliedAt: Date;
  leaveType: { name: string; color: string };
}

export function LeavesPanel({ balance, requests, lang = "en" }: { balance: BalanceItem[]; requests: Req[]; lang?: Lang }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to apply for leave");
        return;
      }
      toast("success", data.request.status === "approved" ? t(lang, "leaves.autoApproved") : t(lang, "leaves.submitted"));
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balance.map((b) => {
          const pct = b.maxDays ? (b.used / b.maxDays) * 100 : 0;
          return (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: b.color }} />
                    {b.name}
                    <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      {b.code}
                    </span>
                  </p>
                  <p className="mt-2 font-display text-3xl font-bold tracking-tight">
                    {b.remaining}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">{t(lang, "leaves.daysLeft", { max: b.maxDays })}</span>
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-tint">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: b.color }} />
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">{t(lang, "leaves.used", { used: b.used })}</p>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} disabled={balance.length === 0}>
          <CalendarPlus className="h-4 w-4" /> {t(lang, "leaves.apply")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t(lang, "leaves.myRequests")}</CardTitle>
            <CardDescription>{t(lang, "leaves.allApplications")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {requests.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">{t(lang, "common.noLeaveRequests")}</p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {r.leaveType.name} · {r.days > 1 ? t(lang, "leaves.days", { n: r.days }) : t(lang, "leaves.day", { n: r.days })}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <StatusPill status={r.status} lang={lang} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t(lang, "leaves.apply")} size="sm">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t(lang, "leaves.leaveType")}>
            <Select name="leaveTypeId" required>
              {balance.map((b) => (
                <option key={b.id} value={b.id} disabled={b.remaining === 0}>
                  {b.name} ({t(lang, "leaves.left", { n: b.remaining })})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t(lang, "leaves.from")}>
              <Input name="fromDate" type="date" required />
            </Field>
            <Field label={t(lang, "leaves.to")}>
              <Input name="toDate" type="date" required />
            </Field>
          </div>
          <Field label={t(lang, "leaves.reason")}>
            <Textarea name="reason" placeholder={t(lang, "leaves.reasonPlaceholder")} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t(lang, "common.cancel")}</Button>
            <Button type="submit" loading={loading}>{t(lang, "leaves.submit")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
