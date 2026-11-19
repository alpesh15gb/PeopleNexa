import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, type LucideIcon } from "lucide-react";
import { StatusPill } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t, type Lang } from "@/lib/i18n";
import { istDateKey } from "@/lib/ist";
import { isShiftWeeklyOff } from "@/lib/shift-weekly-offs";
import { formatCalendarDate } from "@/lib/workspace-time";

type HomeLink = { href: string; label: string; icon: LucideIcon };
type ScheduleShift = { name: string; startTime: string; endTime: string; isNightShift: boolean; weeklyOffDays: number[]; sundayWeeklyOff: boolean };
type LeaveActivity = { id: string; fromDate: Date; toDate: Date; days: number; status: string; leaveType: { name: string; color: string } };

export function EmployeeHomeLinks({ actions }: { actions: HomeLink[] }) {
  return (
    <nav aria-label="Employee self-service" className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
      {actions.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-h-12 items-center gap-2 rounded-xl border border-edge bg-card px-3 py-2 text-sm font-medium hover:border-primary/40 hover:bg-tint">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">{label}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

export function EmployeeWorkSchedule({ days, locale, lang, branchName }: {
  days: { date: string; shift: ScheduleShift | null }[];
  locale: string;
  lang: Lang;
  branchName?: string;
}) {
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  return (
    <Card className="h-full" aria-labelledby="employee-schedule-title">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle id="employee-schedule-title">Work schedule</CardTitle>
          {branchName && <p className="mt-1 truncate text-sm text-muted-foreground">{branchName}</p>}
        </div>
        <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="divide-y divide-edge">
          {days.map(({ date, shift }, index) => {
            const off = isShiftWeeklyOff(shift, date);
            return (
              <li key={date} className="grid grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
                <time dateTime={date} className={index === 0 ? "text-sm font-semibold text-primary" : "text-sm font-medium"}>
                  {formatter.format(new Date(`${date}T00:00:00Z`))}
                </time>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{off ? "Weekly off" : shift?.name ?? t(lang, "common.noShift")}</p>
                  {shift && !off && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{shift.startTime}–{shift.endTime}{shift.isNightShift ? " next day" : ""}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export function EmployeeHomeRequests({ requests }: { requests: (HomeLink & { count: number })[] }) {
  if (requests.length === 0) return null;

  return (
    <Card aria-labelledby="employee-requests-title">
      <CardHeader><CardTitle id="employee-requests-title">My requests awaiting review</CardTitle></CardHeader>
      <CardContent className="pt-3">
        <ul className="divide-y divide-edge">
          {requests.map(({ href, label, icon: Icon, count }) => (
            <li key={href}>
              <Link href={href} className="group flex items-center gap-3 rounded-md px-1 py-2.5 hover:bg-tint">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                <span className="rounded-md bg-tint px-2 py-1 text-xs font-semibold tabular-nums" aria-label={`${count} pending ${label.toLowerCase()}`}>{count}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function EmployeeLeaveActivity({ recent, next, today, locale, lang }: { recent: LeaveActivity[]; next: LeaveActivity | null; today: string; locale: string; lang: Lang }) {
  const dateLabel = (request: LeaveActivity) => {
    const from = istDateKey(request.fromDate);
    const to = istDateKey(request.toDate);
    return [formatCalendarDate(from, locale), ...(to === from ? [] : [formatCalendarDate(to, locale)])].join(" – ");
  };

  return (
    <Card aria-labelledby="employee-leave-title">
      <CardHeader>
        <CardTitle id="employee-leave-title">{t(lang, "dashboard.recentLeaves")}</CardTitle>
        <Link href="/employee/leaves?view=requests" aria-label="View my leave requests" className="shrink-0 text-sm font-medium text-primary hover:underline">View requests</Link>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        {next && (
          <div className="rounded-lg border border-edge bg-tint px-3 py-2.5 text-sm">
            <p className="font-medium">{istDateKey(next.fromDate) <= today ? "Approved leave" : "Next approved leave"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{next.leaveType.name} · {dateLabel(next)}</p>
          </div>
        )}
        {recent.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{t(lang, "common.noLeaveRequests")}</p> : (
          <ul className="divide-y divide-edge">
            {recent.map((request) => (
              <li key={request.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: request.leaveType.color }} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{request.leaveType.name}</p>
                  <p className="text-xs text-muted-foreground">{dateLabel(request)} · {t(lang, "dashboard.days", { n: request.days })}</p>
                </div>
                <StatusPill status={request.status} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
