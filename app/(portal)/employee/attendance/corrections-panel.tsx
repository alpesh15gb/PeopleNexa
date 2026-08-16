"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Plus, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { t, type Lang } from "@/lib/i18n";

type Correction = {
  id: string;
  date: string;
  currentIn: string | null;
  currentOut: string | null;
  requestedIn: string | null;
  requestedOut: string | null;
  reason: string;
  status: string;
  createdAt: string;
};

export function CorrectionsPanel({
  corrections,
  lang = "en",
}: {
  corrections: Correction[];
  lang?: Lang;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.get("date"),
          requestedIn: form.get("requestedIn") ? `${form.get("date")}T${form.get("requestedIn")}` : null,
          requestedOut: form.get("requestedOut") ? `${form.get("date")}T${form.get("requestedOut")}` : null,
          reason: form.get("reason"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      toast("success", t(lang, "corrections.submitted"));
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  const pending = corrections.filter((c) => c.status === "pending").length;

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold tracking-tight">{t(lang, "corrections.title")}</h2>
          {pending > 0 && <Badge tone="warning">{pending} {t(lang, "corrections.pending")}</Badge>}
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t(lang, "corrections.request")}
        </Button>
      </div>

      {corrections.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-5 w-5" />}
          title={t(lang, "corrections.none")}
          description={t(lang, "corrections.noneDesc")}
        />
      ) : (
        <div className="mt-4 divide-y divide-white/[0.04]">
          {corrections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="font-mono text-[12.5px] text-muted-foreground">
                {new Date(c.date).toISOString().slice(0, 10)}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {t(lang, "corrections.requested")}:{" "}
                <span className="text-foreground">
                  {c.requestedIn ? new Date(c.requestedIn).toISOString().slice(11, 16) : "—"} →{" "}
                  {c.requestedOut ? new Date(c.requestedOut).toISOString().slice(11, 16) : "—"}
                </span>
              </span>
              <span className="hidden min-w-0 max-w-xs truncate text-[12.5px] text-muted-foreground sm:inline">
                “{c.reason}”
              </span>
              <Badge tone={c.status === "pending" ? "warning" : c.status === "approved" ? "success" : "danger"} className="ml-auto">
                {t(lang, `status.${c.status}`)}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t(lang, "corrections.request")} size="sm">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t(lang, "corrections.date")}>
            <Input name="date" type="date" required max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t(lang, "corrections.inTime")}>
              <Input name="requestedIn" type="time" />
            </Field>
            <Field label={t(lang, "corrections.outTime")}>
              <Input name="requestedOut" type="time" />
            </Field>
          </div>
          <Field label={t(lang, "corrections.reason")}>
            <Textarea name="reason" required placeholder={t(lang, "corrections.reasonPlaceholder")} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t(lang, "common.cancel")}</Button>
            <Button type="submit" loading={loading}>{t(lang, "corrections.submit")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
