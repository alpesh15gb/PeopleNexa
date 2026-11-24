import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate } from "@/lib/workspace-time";

export type CalendarDay = {
  date: string;
  status: string;
  tone: keyof typeof tones;
  needsReview: boolean;
};

const tones = {
  present: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  late: "bg-orange-500/10 text-orange-800 dark:text-orange-200",
  half: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  leave: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  holiday: "bg-violet-500/10 text-violet-800 dark:text-violet-200",
  missing: "bg-rose-500/10 text-rose-800 dark:text-rose-200",
  neutral: "bg-tint text-muted-foreground",
};

export function AttendanceMonth({ days, month, chosen, today, locale, dayHref }: {
  days: CalendarDay[];
  month: string;
  chosen: string;
  today: string;
  locale: string;
  dayHref: (key: string) => string;
}) {
  const startingWeekday = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const occupied = new Map(days.map((day) => [Number(day.date.slice(-2)), day]));
  const last = new Date(`${month}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const slots = startingWeekday + last.getUTCDate();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });

  return <div className="px-2 py-3 sm:px-4">
    <div className="grid grid-cols-7 gap-1 sm:gap-2">
      {Array.from({ length: 7 }, (_, index) => <div key={index} className="pb-1 text-center text-xs font-medium text-muted-foreground">{weekday.format(new Date(Date.UTC(2024, 0, index + 1)))}</div>)}
      {Array.from({ length: slots }, (_, index) => {
        const number = index - startingWeekday + 1;
        const day = occupied.get(number);
        if (!day) return <div key={index} aria-hidden="true" className="grid min-h-11 place-items-center rounded-md bg-tint/50 text-xs text-muted-foreground/70 sm:min-h-16">{number > 0 ? number : ""}</div>;
        return <Link key={day.date} href={dayHref(day.date)} aria-current={chosen === day.date ? "date" : undefined} aria-label={`${formatCalendarDate(day.date, locale)}${today === day.date ? ", today" : ""}, ${day.status}${day.needsReview ? ", review activity" : ""}`} className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-sm font-semibold outline-offset-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-16 ${tones[day.tone]} ${chosen === day.date ? "border-primary ring-1 ring-primary" : "border-transparent"}`}>
          <span className={today === day.date ? "underline decoration-2 underline-offset-4" : ""}>{number}</span>
          <span className="max-w-full text-center text-[9px] font-medium leading-tight [overflow-wrap:anywhere] sm:text-[10px]">{day.status}</span>
          {day.needsReview && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-current" />}
        </Link>;
      })}
    </div>
    <ul aria-label="Calendar status legend" className="mt-4 flex flex-wrap gap-1.5 text-xs">
      {([ ["present", "Present"], ["late", "Late"], ["half", "Half day"], ["leave", "On leave"], ["holiday", "Holiday"], ["missing", "Missing entry"], ["neutral", "Other dates"] ] as const).map(([tone, label]) => <li key={tone} className={`rounded px-2 py-1 ${tones[tone]}`}>{label}</li>)}
    </ul>
  </div>;
}

type TimelinePunch = { time: Date; label: string; review?: string };

function recordedPunches(record?: { punches: unknown; punchInTime: Date | null; punchOutTime: Date | null }) {
  const entries: TimelinePunch[] = Array.isArray(record?.punches) ? record.punches.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || !("time" in value) || typeof value.time !== "string") return [];
    const time = new Date(value.time);
    if (!Number.isFinite(time.getTime())) return [];
    const type = "type" in value ? value.type : undefined;
    const label = type === "in" ? "Check-in" : type === "out" ? "Check-out" : "Unclassified punch";
    return [{ time, label }];
  }) : [];
  if (entries.length || !record) return entries;
  if (record.punchInTime) entries.push({ time: record.punchInTime, label: "Check-in" });
  if (record.punchOutTime) entries.push({ time: record.punchOutTime, label: "Check-out" });
  return entries;
}

export function AttendanceTimeline({ day, today, shift, record, attempts, correctionHref, correctionOutcome, details, region }: {
  day: CalendarDay;
  today: string;
  shift?: string;
  record?: { punches: unknown; punchInTime: Date | null; punchOutTime: Date | null; lateMinutes: number };
  attempts: { punchTime: Date; inOutHint: string | null; authStatus: string }[];
  correctionHref?: string;
  correctionOutcome?: { status: string; href: string };
  details: string[];
  region: WorkspaceRegion;
}) {
  const entries = recordedPunches(record).sort((a, b) => a.time.getTime() - b.time.getTime());
  const pending = attempts.map((attempt) => ({
    time: attempt.punchTime,
    label: attempt.inOutHint === "in" ? "Check-in attempt" : attempt.inOutHint === "out" ? "Check-out attempt" : "Punch attempt",
    review: attempt.authStatus === "pending" ? "Awaiting review" : "Declined",
  })).sort((a, b) => a.time.getTime() - b.time.getTime());
  const clock = new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const formatTime = (time: Date) => {
    const punchDay = dateKeyInTimeZone(time, region.timeZone);
    return `${punchDay !== day.date ? `${formatCalendarDate(punchDay, region.locale)} · ` : ""}${clock.format(time)}`;
  };

  return <section id={`attendance-${day.date}`} aria-labelledby="punch-timeline-title" className="scroll-mt-24 border-t border-edge px-4 py-5 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="punch-timeline-title" className="font-display text-lg font-semibold">Punch timeline</h3>
        <p className="mt-0.5 text-sm text-muted-foreground"><time dateTime={day.date}>{formatCalendarDate(day.date, region.locale)}</time>{day.date === today ? " · Today" : ""}{shift ? ` · ${shift}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {correctionOutcome && <Link href={correctionOutcome.href} className="inline-flex min-h-10 items-center rounded-md border border-edge px-3 text-sm font-medium text-primary hover:bg-tint">{correctionOutcome.status === "pending" ? "View pending correction" : correctionOutcome.status === "approved" ? "Correction approved" : "Correction declined"}</Link>}
        {correctionHref && <Link href={correctionHref} className="inline-flex min-h-10 items-center rounded-md border border-edge px-3 text-sm font-medium text-primary hover:bg-tint">Request correction</Link>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge>{day.status}</Badge>{Boolean(record?.lateMinutes) && <span>{record?.lateMinutes} min late</span>}{details.map((detail) => <span key={detail}>{detail}</span>)}</div>
    {entries.length > 0 ? <ol className="mt-4 space-y-3 text-sm" aria-label="Recorded punches">
      {entries.map((entry, index) => {
        const gap = index > 0 ? Math.floor((entry.time.getTime() - entries[index - 1].time.getTime()) / 1_000) : null;
        const hours = gap === null ? 0 : Math.floor(gap / 3600);
        const minutes = gap === null ? 0 : Math.floor(gap / 60) % 60;
        const seconds = gap === null ? 0 : gap % 60;
        return <li key={`${entry.time.toISOString()}-${index}`} className="border-l-2 border-edge pl-3">
          <p className="font-medium"><time dateTime={entry.time.toISOString()} className="mr-2 tabular-nums">{formatTime(entry.time)}</time>{entry.label}</p>
          {gap !== null && <p className="text-xs text-muted-foreground">{hours ? `${hours}h ` : ""}{minutes ? `${minutes}m ` : ""}{seconds || gap === 0 ? `${seconds}s ` : ""}since previous punch</p>}
        </li>;
      })}
    </ol> : <p className="mt-4 text-sm text-muted-foreground">No verified punches recorded for this day.</p>}
    {pending.length > 0 && <div className="mt-4 border-t border-edge pt-3">
      <h4 className="text-sm font-semibold">Punch attempts under review or declined</h4>
      <ul className="mt-2 space-y-2 text-sm">{pending.map((attempt, index) => <li key={`${attempt.time.toISOString()}-${index}`}><time dateTime={attempt.time.toISOString()} className="mr-2 tabular-nums">{formatTime(attempt.time)}</time>{attempt.label} <Badge tone={attempt.review === "Declined" ? "danger" : "warning"}>{attempt.review}</Badge></li>)}</ul>
    </div>}
  </section>;
}
