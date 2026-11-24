"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Plus, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, parseWorkspaceWallTime } from "@/lib/workspace-time";
import { DEFAULT_WORKSPACE_REGION, type WorkspaceRegion } from "@/lib/workspace-region";
import { t, type Lang } from "@/lib/i18n";

type Correction = {
  id: string;
  date: Date;
  currentIn: Date | null;
  currentOut: Date | null;
  requestedIn: Date | null;
  requestedOut: Date | null;
  reason: string;
  status: string;
  reviewNote: string | null;
};

export function CorrectionsPanel({
  corrections,
  lang = "en",
  region = DEFAULT_WORKSPACE_REGION,
  today,
  earliestDate,
  initialDate,
  recordedDay,
  openOnLoad,
  closeHref,
  returnToSource,
  keepReviewFilter,
}: {
  corrections: Correction[];
  lang?: Lang;
  region?: WorkspaceRegion;
  today: string;
  earliestDate: string | null;
  initialDate: string;
  recordedDay: { punchInTime: Date | null; punchOutTime: Date | null } | null;
  openOnLoad: boolean;
  closeHref: string;
  returnToSource: boolean;
  keepReviewFilter: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(openOnLoad);
  const [date, setDate] = useState(initialDate || today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dateField = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setError("");
    setDate(today);
    if (openOnLoad) router.replace(closeHref, { scroll: closeHref.includes("#") });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const inStr = String(form.get("requestedIn") ?? "");
      const outStr = String(form.get("requestedOut") ?? "");
      if (!inStr && !outStr) {
        throw new Error("Provide at least one corrected punch time.");
      }
      const inAt = inStr ? parseWorkspaceWallTime(inStr, region.timeZone) : null;
      const outAt = outStr ? parseWorkspaceWallTime(outStr, region.timeZone) : null;
      if ((inStr && !inAt) || (outStr && !outAt)) {
        throw new Error(`Enter a valid local time in ${region.timeZone}.`);
      }
      if (inAt && outAt && inAt.getTime() >= outAt.getTime()) {
        throw new Error("In-time must be before out-time.");
      }
      const now = new Date();
      if ((inAt && inAt.getTime() > now.getTime()) || (outAt && outAt.getTime() > now.getTime())) {
        throw new Error("Corrected punch times cannot be in the future.");
      }
      const res = await fetch("/api/attendance/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          requestedIn: inStr || null,
          requestedOut: outStr || null,
          reason: form.get("reason"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The request could not be confirmed. Check your correction history before trying again.");
      toast("success", t(lang, "corrections.submitted"));
      setOpen(false);
      const anchor = typeof data.correction?.id === "string" ? `correction-${encodeURIComponent(data.correction.id)}` : `corrections-${date}`;
      const listHref = `/employee/attendance?month=${date.slice(0, 7)}&view=corrections${keepReviewFilter ? "&focus=review" : ""}#${anchor}`;
      router.replace(returnToSource && date === initialDate ? closeHref : listHref, { scroll: true });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.name !== "TypeError" ? e.message : "The request could not be confirmed. Check your correction history before trying again.");
    } finally {
      setLoading(false);
    }
  }

  const pending = corrections.filter((c) => c.status === "pending").length;
  function punchLabel(time: Date | null, day: string, empty: string) {
    if (!time) return empty;
    const punchDay = dateKeyInTimeZone(time, region.timeZone);
    return `${punchDay !== day ? `${formatCalendarDate(punchDay, region.locale)} · ` : ""}${formatWorkspaceTime(time, region)}`;
  }

  return (
    <section aria-labelledby="attendance-corrections">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h2 id="attendance-corrections" className="font-display text-base font-semibold tracking-tight">{t(lang, "corrections.title")}</h2>
          {pending > 0 && <Badge tone="warning">{pending} {t(lang, "corrections.pending")}</Badge>}
        </div>
        <Button size="sm" disabled={!!earliestDate && earliestDate > today} onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t(lang, "corrections.request")}
        </Button>
      </div>

      {corrections.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-5 w-5" />}
          title={t(lang, "corrections.none")}
          description="No punch correction requests for this month."
        />
      ) : (
        <div className="mt-4 divide-y divide-[color:var(--border)]">
          {corrections.map((c, index) => {
            const day = istDateKey(c.date);
            const dayHref = `/employee/attendance?view=entries&layout=calendar&month=${day.slice(0, 7)}&date=${day}#attendance-${day}`;
            return <div key={c.id} id={index === 0 || istDateKey(corrections[index - 1].date) !== day ? `corrections-${day}` : undefined} className="scroll-mt-24 py-4">
              <article id={`correction-${c.id}`} className="scroll-mt-24 space-y-2 rounded-lg px-2 target:bg-primary/5 target:ring-1 target:ring-primary/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <time dateTime={day} className="font-medium">{formatCalendarDate(day, region.locale)}</time>
                <Badge tone={c.status === "pending" ? "warning" : c.status === "approved" ? "success" : "danger"}>{t(lang, `status.${c.status}`)}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Check-in</dt><dd>{punchLabel(c.currentIn, day, "No recorded punch")} → {punchLabel(c.requestedIn, day, "No change requested")}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Check-out</dt><dd>{punchLabel(c.currentOut, day, "No recorded punch")} → {punchLabel(c.requestedOut, day, "No change requested")}</dd></div>
              </dl>
              <p className="break-words text-sm text-muted-foreground">{c.reason}</p>
              {c.reviewNote && <p className="break-words text-sm"><span className="font-medium">Reviewer note</span> · {c.reviewNote}</p>}
              <Link href={dayHref} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">View attendance for this date</Link>
              </article>
            </div>;
          })}
        </div>
      )}

      <Modal open={open} onClose={() => !loading && close()} title={t(lang, "corrections.request")} description={`Enter only the times that need changing, in ${region.timeZone}. For overnight work, select the shift’s start date below, then enter each punch’s actual date and time.`} size="md" placement="drawer" initialFocus={dateField}>
        <form onSubmit={submit} className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <Field label={t(lang, "corrections.date")}>
            <Input ref={dateField} name="date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} min={earliestDate ?? undefined} max={today} />
          </Field>
          {initialDate && date === initialDate && <dl className="grid grid-cols-2 gap-3 rounded-lg bg-tint p-3 text-sm" aria-label="Currently recorded punches">
            <div><dt className="text-xs text-muted-foreground">Recorded check-in</dt><dd>{formatWorkspaceTime(recordedDay?.punchInTime, region)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Recorded check-out</dt><dd>{formatWorkspaceTime(recordedDay?.punchOutTime, region)}</dd></div>
          </dl>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t(lang, "corrections.inTime")}>
              <Input name="requestedIn" type="datetime-local" />
            </Field>
            <Field label={t(lang, "corrections.outTime")}>
              <Input name="requestedOut" type="datetime-local" />
            </Field>
          </div>
          <Field label={t(lang, "corrections.reason")}>
            <Textarea name="reason" required maxLength={2000} placeholder={t(lang, "corrections.reasonPlaceholder")} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={loading} onClick={close}>{t(lang, "common.cancel")}</Button>
            <Button type="submit" loading={loading}>{t(lang, "corrections.submit")}</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
