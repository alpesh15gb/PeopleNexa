import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { holidaysForAttendanceDay } from "@/lib/attendance-tally";
import { dayRangeIST, isDateKey, isMonthKey } from "@/lib/dates";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { istDateKey } from "@/lib/ist";
import { countsAsLeaveDay } from "@/lib/leave-calendar";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { isShiftWeeklyOff } from "@/lib/shift-weekly-offs";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, offsetDateKey } from "@/lib/workspace-time";
import { attendanceDayForPunch } from "@/lib/reconcile";
import { timeZoneDayRange } from "@/lib/workspace-time";
import { TodayAttendance } from "./today-attendance";
import { CorrectionsPanel } from "./corrections-panel";
import { AttendanceMonth, AttendanceTimeline, type CalendarDay } from "./attendance-month";

export const dynamic = "force-dynamic";

function moveMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export default async function EmployeeAttendancePage({ searchParams }: {
  searchParams: Promise<{ month?: string; view?: string; action?: string; date?: string; focus?: string; from?: string; fromMonth?: string; layout?: string }>;
}) {
  const session = await requireActiveSession();
  const [lang, employee, query] = await Promise.all([
    getLang(),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: {
      id: true, tenantId: true, branchId: true, shiftId: true, firstName: true, lastName: true, loginOnly: true, joiningDate: true, branch: { select: { name: true, geofenceRadius: true, latitude: true, longitude: true } }, tenant: { select: { config: true } }, shift: { select: { name: true, sundayWeeklyOff: true, weeklyOffDays: true } },
    } }),
    searchParams,
  ]);
  if (!employee) return null;

  const region = workspaceRegion(employee.tenant.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const currentMonth = today.slice(0, 7);
  const requested = typeof query.month === "string" ? query.month : "";
  const dateParam = typeof query.date === "string" ? query.date : "";
  const inferredMonth = !requested && query.action === "request" && isDateKey(dateParam) ? dateParam.slice(0, 7) : requested;
  const month = isMonthKey(inferredMonth) && isDateKey(`${inferredMonth}-01`) && inferredMonth <= currentMonth ? inferredMonth : currentMonth;
  const from = `${month}-01`;
  const nextMonth = moveMonth(month, 1);
  const lastDay = month === currentMonth ? today : offsetDateKey(`${nextMonth}-01`, -1);
  const bounds = { gte: dayRangeIST(from).start, lt: dayRangeIST(lastDay).end };
  const joined = employee.joiningDate ? istDateKey(employee.joiningDate) : null;
  const backdate = ["admin", "supervisor"].includes(session.role) ? null : offsetDateKey(today, -60);
  const earliestCorrection = joined && (!backdate || joined > backdate) ? joined : backdate;
  const view = employee.loginOnly ? "entries" : query.view === "corrections" || query.action === "request" ? "corrections" : query.view === "entries" || (requested && query.view !== "today") ? "entries" : "today";
  const canRequest = !earliestCorrection || earliestCorrection <= today;
  const prefill = isDateKey(dateParam) && dateParam >= from && dateParam <= lastDay && (!earliestCorrection || dateParam >= earliestCorrection) ? dateParam : "";
  const scope = { employeeId: session.sub, tenantId: session.tenantId };
  const showEntries = view === "entries" && !employee.loginOnly;
  const [records, leaves, holidays, corrections, roster, reviewPunches, recordedCorrectionDay] = await Promise.all([
    showEntries ? prisma.attendance.findMany({ where: { ...scope, date: bounds }, include: { shift: { select: { name: true, sundayWeeklyOff: true, weeklyOffDays: true } } } }) : [],
    showEntries ? prisma.leaveRequest.findMany({ where: { ...scope, status: "approved", fromDate: { lt: bounds.lt }, toDate: { gte: bounds.gte } }, select: { fromDate: true, toDate: true, leavePolicySnapshot: true, leaveType: { select: { name: true } } } }) : [],
    showEntries ? prisma.holiday.findMany({ where: { tenantId: session.tenantId, OR: [{ isRecurring: true }, { date: bounds }] } }) : [],
    view === "today" || employee.loginOnly ? [] : prisma.punchCorrection.findMany({ where: { ...scope, date: bounds }, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }] }),
    showEntries ? prisma.rosterAssignment.findMany({ where: { ...scope, date: bounds }, select: { date: true, shift: { select: { name: true, sundayWeeklyOff: true, weeklyOffDays: true } } } }) : [],
    showEntries ? prisma.punch.findMany({
      where: { ...scope, authStatus: { in: ["pending", "declined"] }, punchTime: { gte: timeZoneDayRange(from, region.timeZone).start, lt: timeZoneDayRange(offsetDateKey(lastDay, 1), region.timeZone).end } },
      select: { authStatus: true, punchTime: true, inOutHint: true },
      orderBy: { punchTime: "desc" },
    }) : [],
    view === "corrections" && query.action === "request" && prefill ? prisma.attendance.findFirst({ where: { ...scope, date: { gte: dayRangeIST(prefill).start, lt: dayRangeIST(prefill).end } }, select: { punchInTime: true, punchOutTime: true } }) : null,
  ]);

  const reviewByDay = new Map<string, { pending: boolean; declined: boolean; attempts: (typeof reviewPunches)[number][] }>();
  for (const punch of reviewPunches) {
    const date = istDateKey(await attendanceDayForPunch(employee, punch.punchTime, region.timeZone));
    const outcome = reviewByDay.get(date) ?? { pending: false, declined: false, attempts: [] };
    if (punch.authStatus === "pending") outcome.pending = true;
    if (punch.authStatus === "declined") outcome.declined = true;
    outcome.attempts.push(punch);
    reviewByDay.set(date, outcome);
  }
  const correctionByDay = new Map<string, { id: string; status: string }>();
  for (const correction of corrections) {
    const key = istDateKey(correction.date);
    if (!correctionByDay.has(key) || correction.status === "pending") correctionByDay.set(key, correction);
  }
  const recordByDay = new Map(records.map((record) => [istDateKey(record.date), record]));
  const shiftByDay = new Map(roster.map((entry) => [istDateKey(entry.date), entry.shift]));
  const leaveRanges = leaves.map((leave) => ({ ...leave, from: istDateKey(leave.fromDate), to: istDateKey(leave.toDate) }));
  const days = Array.from({ length: Number(lastDay.slice(-2)) }, (_, index) => offsetDateKey(lastDay, -index));
  const attentionFilter = query.focus === "review";
  const attentionOnly = view === "entries" && attentionFilter;
  const layout = query.layout === "list" || (query.layout !== "calendar" && attentionFilter) ? "list" : "calendar";
  const reviewDays = days.filter((day) => reviewByDay.has(day) || correctionByDay.get(day)?.status === "pending" || ["missed_punch", "needs_review"].includes(recordByDay.get(day)?.reviewStatus ?? ""));
  const visibleDays = attentionOnly ? reviewDays : days;
  const selected = visibleDays.includes(dateParam) ? dateParam : visibleDays[0];
  const monthLabel = new Intl.DateTimeFormat(region.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from}T00:00:00Z`));

  function href(monthKey: string, section = view, filter = attentionFilter, presentation = layout) {
    return `/employee/attendance?${new URLSearchParams({
      view: section,
      ...(section !== "today" || monthKey !== currentMonth ? { month: monthKey } : {}),
      ...(filter ? { focus: "review" } : {}),
      ...(section !== "today" ? { layout: presentation } : {}),
    })}`;
  }

  const fromEntries = query.from === "entries";
  const fromToday = query.from === "today";
  const priorMonth = typeof query.fromMonth === "string" && isMonthKey(query.fromMonth) && isDateKey(`${query.fromMonth}-01`) && query.fromMonth <= currentMonth ? query.fromMonth : month;
  const closeHref = fromToday ? href(priorMonth, "today") : fromEntries ? `${href(month, "entries")}${prefill ? `&date=${prefill}#attendance-${prefill}` : ""}` : href(month, "corrections");
  const needsReview = new Set(reviewDays);
  const entryByDate = new Map(visibleDays.map((date) => {
    const record = recordByDay.get(date);
    const shift = shiftByDay.get(date) ?? record?.shift ?? employee.shift;
    const holiday = holidaysForAttendanceDay(holidays, date)[0];
    const leave = leaveRanges.find((item) => date >= item.from && date <= item.to && countsAsLeaveDay(item.leavePolicySnapshot, date));
    const beforeJoining = Boolean(joined && date < joined);
    const weeklyOff = isShiftWeeklyOff(shift, date);
    const correction = correctionByDay.get(date);
    const punchReview = reviewByDay.get(date);
    const recordTone = { present: "present", late: "late", half_day: "half", absent: "missing", on_leave: "leave", holiday: "holiday" } as const;
    const tone = record ? recordTone[record.status as keyof typeof recordTone] ?? "neutral" : holiday ? "holiday" : leave ? "leave" : beforeJoining || weeklyOff || date === today ? "neutral" : "missing";
    const status = record ? t(lang, `status.${record.status}`) : holiday ? holiday.isHalfDay ? "Half-day holiday" : "Holiday" : leave ? t(lang, "common.onLeave") : beforeJoining ? "Before joining" : weeklyOff ? t(lang, "attendance.weeklyOff") : "No entry";
    const calendarDay: CalendarDay = { date, status, tone, needsReview: needsReview.has(date) };
    return [date, { calendarDay, record, shift, holiday, leave, beforeJoining, punchReview, correction, canCorrect: !beforeJoining && (!earliestCorrection || date >= earliestCorrection) }];
  }));
  const chosen = selected ? entryByDate.get(selected) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title={t(lang, "attendance.title")} description={region.timeZone} />
      <nav className="flex flex-wrap gap-5 border-b border-edge text-sm" aria-label="My attendance views">
        {([ ["today", "Today"], ["entries", "Time entries"], ["corrections", "Correction requests"] ] as const).filter(([key]) => key === "entries" || !employee.loginOnly).map(([key, label]) => (
          <Link key={key} href={href(month, key)} aria-current={view === key ? "page" : undefined} className={`border-b-2 px-1 py-3 font-medium ${view === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {view !== "today" && !employee.loginOnly && <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-edge bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={href(moveMonth(month, -1))} aria-label="Previous month" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-edge hover:bg-tint"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Link>
          <h2 className="min-w-32 text-center font-display font-semibold">{monthLabel}</h2>
          {month < currentMonth && <Link href={href(nextMonth)} aria-label="Next month" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-edge hover:bg-tint"><ChevronRight aria-hidden="true" className="h-4 w-4" /></Link>}
        </div>
        <form action="/employee/attendance" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="layout" value={layout} />
          {attentionFilter && <input type="hidden" name="focus" value="review" />}
          <Field label="Attendance month"><Input type="month" name="month" max={currentMonth} defaultValue={month} required /></Field>
          <Button type="submit" variant="outline"><CalendarDays aria-hidden="true" className="h-4 w-4" /> View month</Button>
        </form>
      </div>}

      {view === "today" ? (
        <TodayAttendance employee={employee} region={region} lang={lang} now={new Date()} earliestCorrection={earliestCorrection} keepReviewFilter={attentionFilter} selectedMonth={month} />
      ) : view === "corrections" ? (
        <Card><CardContent>
          <CorrectionsPanel key={`${month}-${query.action}-${prefill}-${closeHref}`} corrections={corrections} lang={lang} region={region} today={today} earliestDate={earliestCorrection} openOnLoad={query.action === "request" && canRequest} initialDate={prefill} recordedDay={recordedCorrectionDay} closeHref={closeHref} returnToSource={fromEntries || fromToday} keepReviewFilter={attentionFilter} />
        </CardContent></Card>
      ) : employee.loginOnly ? (
        <Card><CardContent><p className="text-sm text-muted-foreground">Attendance entries are available for staff accounts.</p></CardContent></Card>
      ) : (
        <Card>
          <div className="flex flex-wrap justify-between gap-2 border-b border-edge p-3 text-sm">
            <nav aria-label="Filter attendance entries" className="flex flex-wrap gap-2">
              <Link aria-current={!attentionOnly ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 ${!attentionOnly ? "bg-primary/10 text-primary" : "hover:bg-tint"}`} href={href(month, "entries", false)}>All dates</Link>
              <Link aria-current={attentionOnly ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 ${attentionOnly ? "bg-primary/10 text-primary" : "hover:bg-tint"}`} href={href(month, "entries", true, "list")}>Needs review ({reviewDays.length})</Link>
            </nav>
            <nav aria-label="Attendance layout" className="flex gap-2">
              {([ ["calendar", "Calendar"], ["list", "List"] ] as const).map(([key, label]) => <Link key={key} aria-current={layout === key ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 ${layout === key ? "bg-primary/10 text-primary" : "hover:bg-tint"}`} href={href(month, "entries", attentionOnly, key)}>{label}</Link>)}
            </nav>
          </div>
          {chosen && layout === "calendar" ? <>
            <AttendanceMonth days={Array.from(entryByDate.values(), (entry) => entry.calendarDay)} month={month} chosen={chosen.calendarDay.date} today={today} locale={region.locale} dayHref={(day) => `${href(month, "entries")}&date=${day}#attendance-${day}`} />
            <AttendanceTimeline day={chosen.calendarDay} today={today} shift={chosen.shift?.name} record={chosen.record} attempts={chosen.punchReview?.attempts ?? []} region={region} details={[
              chosen.holiday?.name, chosen.leave?.leaveType.name,
              chosen.record?.reviewStatus === "missed_punch" ? "Missing punch" : chosen.record?.reviewStatus === "needs_review" ? "Needs review" : undefined,
            ].filter((detail): detail is string => Boolean(detail))} correctionHref={chosen.canCorrect && chosen.correction?.status !== "pending" ? `${href(month, "corrections")}&action=request&date=${chosen.calendarDay.date}&from=entries` : undefined} correctionOutcome={chosen.correction && { status: chosen.correction.status, href: `${href(month, "corrections")}#correction-${chosen.correction.id}` }} />
          </> : visibleDays.length ? <Table>
            <caption className="sr-only">Daily attendance for {monthLabel}</caption>
            <THead><TR><TH>{t(lang, "attendance.date")}</TH><TH>{t(lang, "attendance.status")}</TH><TH>{t(lang, "attendance.in")}</TH><TH>{t(lang, "attendance.out")}</TH><TH className="hidden xl:table-cell">Shift</TH><TH>Correction</TH></TR></THead>
            <TBody>{Array.from(entryByDate.entries()).map(([day, { record, shift, holiday, leave, beforeJoining, punchReview, canCorrect, correction }]) => {
              return <TR key={day} id={`attendance-${day}`} className="scroll-mt-24">
                <TH scope="row" className="whitespace-nowrap py-3 text-sm font-medium normal-case tracking-normal text-foreground"><time dateTime={day}>{formatCalendarDate(day, region.locale)}</time>{day === today && <span className="ml-1 text-xs text-muted-foreground">Today</span>}</TH>
                <TD className="whitespace-nowrap">
                  {record ? <StatusPill status={record.status} lang={lang} /> : holiday ? <Badge tone="violet">{holiday.isHalfDay ? "Half-day holiday" : "Holiday"}</Badge> : leave ? <Badge tone="info">{t(lang, "common.onLeave")}</Badge> : beforeJoining ? <span className="text-muted-foreground">Before joining</span> : isShiftWeeklyOff(shift, day) ? <Badge>{t(lang, "attendance.weeklyOff")}</Badge> : <span className="text-muted-foreground">No entry</span>}
                  {punchReview?.pending ? <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">Punch awaiting review</span> : punchReview?.declined && <span className="mt-1 block text-xs font-medium text-destructive">Punch declined</span>}
                  {record?.reviewStatus === "missed_punch" && <span className="mt-1 block text-xs text-muted-foreground">Missing punch</span>}
                  {record?.reviewStatus === "needs_review" && <span className="mt-1 block text-xs text-muted-foreground">Needs review</span>}
                  {(holiday || leave) && <span className="mt-1 block text-xs text-muted-foreground">{[holiday?.name, leave?.leaveType.name].filter(Boolean).join(" · ")}</span>}
                </TD>
                <TD className="tabular-nums">{formatWorkspaceTime(record?.punchInTime, region)}</TD>
                <TD className="tabular-nums">{formatWorkspaceTime(record?.punchOutTime, region)}</TD>
                <TD className="hidden text-muted-foreground xl:table-cell">{shift?.name ?? "—"}</TD>
                <TD>
                  {correction && <Link href={`${href(month, "corrections")}#correction-${correction.id}`} className="mr-3 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{correction.status === "pending" ? "Pending review" : correction.status === "approved" ? "Approved" : "Declined"}</Link>}
                  {canCorrect && correction?.status !== "pending" && <Link href={`${href(month, "corrections")}&action=request&date=${day}&from=entries`} aria-label={`Request correction for ${formatCalendarDate(day, region.locale)}`} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Request</Link>}
                  {!correction && !canCorrect && <span className="text-muted-foreground">—</span>}
                </TD>
              </TR>;
            })}</TBody>
          </Table> : <p className="p-5 text-sm text-muted-foreground">No dates need review this month.</p>}
        </Card>
      )}
    </div>
  );
}
