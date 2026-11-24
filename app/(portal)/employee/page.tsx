import Link from "next/link";
import { ArrowRight, BadgePercent, Banknote, BookOpen, CalendarCheck2, CalendarClock, ClipboardCheck, Clock4, DoorOpen, FileText, LifeBuoy, Megaphone, Package, Receipt, ScanFace, Target, UserRound } from "lucide-react";
import { EssInstall } from "@/components/ess-install";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { dayRangeIST, isMonthKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { istDateKey } from "@/lib/ist";
import { leaveAwaitingReview } from "@/lib/leave-lifecycle";
import { holidaysForAttendanceDay } from "@/lib/attendance-tally";
import { personalPayslipWhere } from "@/lib/personal-payslips";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { attendanceDayForPunch, shiftForEmployeeDay, shiftWindow } from "@/lib/reconcile";
import { requireSession } from "@/lib/session";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, offsetDateKey } from "@/lib/workspace-time";
import { ClockCard } from "./clock-card";
import { EmployeeHomeLinks, EmployeeHomeRequests, EmployeeLeaveActivity, EmployeeServiceDirectory, EmployeeWorkSchedule } from "./employee-home-panels";

export const dynamic = "force-dynamic";

const leaveDetails = {
  id: true,
  fromDate: true,
  toDate: true,
  days: true,
  status: true,
  cancellationRequestedAt: true,
  leaveType: { select: { name: true, color: true } },
} as const;

export default async function EmployeeDashboardPage() {
  const session = await requireSession();
  const [lang, access, employee] = await Promise.all([
    getLang(),
    getTenantAccess(session.tenantId),
    prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: {
        id: true, tenantId: true, firstName: true, lastName: true, position: true, loginOnly: true,
        shiftId: true, branchId: true, locationId: true,
        shift: true,
        branch: { select: { name: true, geofenceRadius: true, latitude: true, longitude: true } },
        department: { select: { name: true } },
        tenant: { select: { config: true } },
      },
    }),
  ]);
  if (!employee) return null;

  const modules = employee.loginOnly ? new Set<string>() : access.modules;
  const now = new Date();
  const region = workspaceRegion(employee.tenant.config);
  const today = dateKeyInTimeZone(now, region.timeZone);
  const todayRange = dayRangeIST(today);
  const scheduleDays = [today, offsetDateKey(today, 1), offsetDateKey(today, 2)];
  const where = { tenantId: session.tenantId, employeeId: employee.id };
  const showSchedule = modules.has("shifts") || modules.has("rosters");

  const [attendance, leave, expenseRequests, roster, onboardingTasks, selfReviews, exitRequests, holidays, latestPayslip, announcements] = await Promise.all([
    modules.has("attendance") ? (async () => {
      const workDay = await attendanceDayForPunch(employee, now, region.timeZone);
      const shift = await shiftForEmployeeDay(employee, workDay, region.timeZone);
      const window = shiftWindow(workDay, shift, region.timeZone);
      const [record, monthRecords, heldPunches, corrections] = await Promise.all([
        prisma.attendance.findFirst({ where: { ...where, date: workDay } }),
        prisma.attendance.groupBy({
          by: ["status"],
          where: { ...where, date: { gte: dayRangeIST(`${today.slice(0, 7)}-01`).start, lt: todayRange.end }, status: { in: ["present", "half_day", "late"] } },
          _count: { _all: true },
        }),
        prisma.punch.findMany({
          where: { ...where, authStatus: "pending", punchTime: { gte: window.start, lt: window.end } },
          select: { inOutHint: true },
        }),
        prisma.punchCorrection.count({ where: { ...where, status: "pending" } }),
      ]);
      const counts = new Map(monthRecords.map(({ status, _count }) => [status, _count._all]));
      return {
        date: istDateKey(workDay),
        record,
        shift,
        attended: (counts.get("present") ?? 0) + (counts.get("half_day") ?? 0) + (counts.get("late") ?? 0),
        late: counts.get("late") ?? 0,
        corrections,
        pendingIn: heldPunches.some(({ inOutHint }) => inOutHint === "in" || inOutHint === "unknown"),
        pendingOut: heldPunches.some(({ inOutHint }) => inOutHint === "out"),
        pendingApproval: heldPunches.length > 0,
      };
    })() : null,
    modules.has("leaves") ? (async () => {
      const [recent, next, pending, configuredType] = await Promise.all([
        prisma.leaveRequest.findMany({ where, select: leaveDetails, orderBy: [{ appliedAt: "desc" }, { id: "desc" }], take: 3 }),
        prisma.leaveRequest.findFirst({ where: { ...where, status: "approved", toDate: { gte: todayRange.start } }, select: leaveDetails, orderBy: [{ fromDate: "asc" }, { id: "asc" }] }),
        prisma.leaveRequest.count({ where: { ...where, ...leaveAwaitingReview } }),
        prisma.leaveType.findFirst({ where: { tenantId: session.tenantId }, select: { id: true } }),
      ]);
      return { recent, next, pending, canApply: Boolean(configuredType) };
    })() : null,
    modules.has("expenses") ? prisma.expenseClaim.count({ where: { ...where, status: "pending" } }) : null,
    showSchedule ? prisma.rosterAssignment.findMany({
      where: { ...where, date: { in: scheduleDays.map((date) => dayRangeIST(date).start) } },
      select: { date: true, shift: true },
    }) : [],
    modules.has("onboarding") ? prisma.onboardingTask.count({ where: { ...where, status: "pending" } }) : 0,
    modules.has("performance") ? prisma.performanceReview.count({ where: { ...where, status: "draft" } }) : 0,
    modules.has("exit") ? prisma.exitRequest.count({ where: { ...where, status: "pending" } }) : null,
    modules.has("holidays") ? prisma.holiday.findMany({
      where: { tenantId: session.tenantId, OR: [{ isRecurring: true }, { date: { gte: todayRange.start, lt: dayRangeIST(offsetDateKey(today, 30)).end } }] },
      select: { id: true, name: true, date: true, isRecurring: true, isHalfDay: true },
    }) : null,
    modules.has("payroll") ? prisma.payslip.findFirst({
      where: personalPayslipWhere(session.tenantId, session.sub, false),
      orderBy: [{ month: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true, month: true },
    }) : null,
    modules.has("feed") ? prisma.orgPost.findMany({
      where: { tenantId: session.tenantId, isAnnouncement: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2, select: { id: true, body: true },
    }) : null,
  ]);
  const upcomingHolidays = holidays ? Array.from({ length: 31 }, (_, index) => offsetDateKey(today, index)).flatMap((day) =>
    holidaysForAttendanceDay(holidays, day).map((item) => ({ ...item, day })),
  ).slice(0, 4) : null;

  const tasks = [
    ...(onboardingTasks > 0 ? [{ href: "/employee/onboarding", label: `${onboardingTasks} onboarding ${onboardingTasks === 1 ? "task" : "tasks"} to complete`, icon: ClipboardCheck }] : []),
    ...(selfReviews > 0 ? [{ href: "/employee/performance", label: `${selfReviews} self-${selfReviews === 1 ? "review" : "reviews"} to complete`, icon: Target }] : []),
  ];
  const shortcuts = [
    ...(leave?.canApply ? [{ href: "/employee/leaves?action=apply", label: t(lang, "leaves.apply"), icon: CalendarCheck2 }] : []),
    ...(expenseRequests !== null ? [{ href: "/employee/expenses?action=new", label: "New expense claim", icon: Receipt }] : []),
    ...(modules.has("helpdesk") ? [{ href: "/employee/helpdesk?action=new", label: "Raise a support ticket", icon: LifeBuoy }] : []),
  ];
  const services = [
    { label: "Personal", links: [
      { href: "/employee/profile", label: t(lang, "profile.title"), icon: UserRound },
      ...(modules.has("onboarding") ? [{ href: "/employee/onboarding", label: t(lang, "nav.onboarding"), icon: ClipboardCheck }] : []),
      ...(modules.has("performance") ? [{ href: "/employee/performance", label: t(lang, "nav.performance"), icon: Target }] : []),
      ...(exitRequests !== null ? [{ href: "/employee/exits", label: "Exit requests", icon: DoorOpen }] : []),
    ] },
    { label: "Time and leave", links: [
      ...(attendance ? [
        { href: "/employee/attendance?view=entries", label: "Attendance history", icon: CalendarClock },
        { href: "/employee/face-id", label: "Face ID", icon: ScanFace },
      ] : []),
      ...(leave ? [{ href: "/employee/leaves", label: "Leave balances", icon: CalendarCheck2 }] : []),
    ] },
    { label: "Pay and expenses", links: [
      ...(modules.has("payroll") ? [
        { href: "/employee/payslips", label: t(lang, "nav.payslips"), icon: Banknote },
        { href: "/employee/tax", label: t(lang, "nav.taxDeclarations"), icon: BadgePercent },
      ] : []),
      ...(expenseRequests !== null ? [{ href: "/employee/expenses", label: "Expense claims", icon: Receipt }] : []),
    ] },
    { label: "Workplace resources", links: [
      ...(modules.has("documents") ? [{ href: "/employee/documents", label: "Document center", icon: FileText }] : []),
      ...(modules.has("assets") ? [{ href: modules.has("documents") ? "/employee/documents?view=assets" : "/employee/profile#my-assets", label: "Assigned assets", icon: Package }] : []),
      ...(modules.has("policies") ? [{ href: "/employee/policies", label: t(lang, "nav.policies"), icon: BookOpen }] : []),
      ...(modules.has("feed") ? [{ href: "/employee/feed", label: "Company feed", icon: Megaphone }] : []),
      ...(modules.has("helpdesk") ? [{ href: "/employee/helpdesk", label: "Helpdesk", icon: LifeBuoy }] : []),
    ] },
  ];
  const requests = [
    ...(leave ? [{ href: "/employee/leaves?view=requests&status=awaiting_review", label: "Leave and cancellations", icon: CalendarCheck2, count: leave.pending }] : []),
    ...(attendance ? [{ href: "/employee/attendance?view=corrections", label: "Attendance corrections", icon: CalendarClock, count: attendance.corrections }] : []),
    ...(expenseRequests !== null ? [{ href: "/employee/expenses?status=pending", label: "Expense claims", icon: Receipt, count: expenseRequests }] : []),
    ...(exitRequests !== null ? [{ href: "/employee/exits", label: "Exit requests", icon: DoorOpen, count: exitRequests }] : []),
  ];
  const shiftsByDay = new Map(roster.map(({ date, shift }) => [istDateKey(date), shift]));
  const schedule = scheduleDays.map((date) => ({ date, shift: (date === attendance?.date ? attendance.shift : null) ?? shiftsByDay.get(date) ?? employee.shift }));
  const nextTask = tasks[0];
  const otherTasks = tasks.slice(1);
  const activeRequests = requests.filter(request => request.count > 0);
  const hasPrimaryActions = Boolean(attendance || shortcuts.length);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "dashboard.welcome", { name: employee.firstName })}
        description={[employee.position, employee.department?.name, attendance ? null : formatCalendarDate(today, region.locale)].filter(Boolean).join(" · ")}
      />
      {nextTask && <section aria-label="Needs your attention" className="relative overflow-hidden rounded-xl bg-[#16392d] px-5 py-5 text-[#f2faf4] sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-7 -top-16 size-48 rounded-full border-[26px] border-[#96d78c]/15" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-medium text-[#cce6d4]">Needs your attention</p><h2 className="mt-1 text-lg font-semibold">{nextTask.label}</h2></div>
          <Link href={nextTask.href} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#d4efb9] px-4 text-sm font-semibold text-[#173924] hover:bg-[#e5f8d3]">
            {nextTask.href === "/employee/onboarding" ? "Continue onboarding" : "Open self-review"} <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>}
      {otherTasks.length > 0 && <EmployeeHomeLinks actions={otherTasks} label="Other outstanding tasks" />}
      {(hasPrimaryActions || showSchedule) && (
        <div className={hasPrimaryActions && showSchedule ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : "grid gap-4"}>
          {hasPrimaryActions && <div className="min-w-0 space-y-4">
            {attendance && (
              <ClockCard
                region={region}
                record={attendance.record}
                shift={attendance.shift}
                branch={employee.branch}
                employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
                lang={lang}
                pendingApproval={attendance.pendingApproval}
                pendingIn={attendance.pendingIn}
                pendingOut={attendance.pendingOut}
              />
            )}
            {shortcuts.length > 0 && <section className="space-y-2" aria-labelledby="home-shortcuts">
              <h2 id="home-shortcuts" className="text-base font-semibold">Quick actions</h2>
              <EmployeeHomeLinks actions={shortcuts} label="Quick employee actions" />
            </section>}
          </div>}
          {showSchedule && <EmployeeWorkSchedule days={schedule} lang={lang} locale={region.locale} branchName={modules.has("branches") ? employee.branch?.name : undefined} />}
        </div>
      )}

      {(attendance || activeRequests.length > 0) && (
        <div className={attendance && requests.length > 0 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
          {attendance && (
            <Card aria-labelledby="employee-attendance-summary">
              <CardHeader>
                <CardTitle id="employee-attendance-summary">Attendance this month</CardTitle>
                <Link href="/employee/attendance?view=entries" className="shrink-0 text-sm font-medium text-primary hover:underline">View entries</Link>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 pt-4">
                <div className="rounded-lg bg-tint p-3">
                  <CalendarCheck2 className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">Days with attendance</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{t(lang, attendance.attended === 1 ? "leaves.day" : "dashboard.days", { n: attendance.attended })}</p>
                </div>
                <div className="rounded-lg bg-tint p-3">
                  <Clock4 className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">{t(lang, "common.late")}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{t(lang, attendance.late === 1 ? "leaves.day" : "dashboard.days", { n: attendance.late })}</p>
                </div>
              </CardContent>
            </Card>
          )}
          <EmployeeHomeRequests requests={activeRequests} />
        </div>
      )}
      {(upcomingHolidays || modules.has("payroll") || announcements) && <div className="grid gap-3 lg:grid-cols-3">
        {upcomingHolidays && <Card><CardHeader><CardTitle>Upcoming holidays</CardTitle></CardHeader><CardContent className="pt-3">
          {upcomingHolidays.length > 0 ? <ul className="divide-y divide-edge">{upcomingHolidays.map((holiday) => <li key={`${holiday.id}:${holiday.day}`} className="py-2 text-sm"><p className="font-medium">{holiday.name}{holiday.isHalfDay && " · Half day"}</p><time dateTime={holiday.day} className="text-xs text-muted-foreground">{formatCalendarDate(holiday.day, region.locale)}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">No holidays are scheduled in the next 30 days.</p>}
        </CardContent></Card>}
        {modules.has("payroll") && <Card><CardHeader><CardTitle>Latest payslip</CardTitle></CardHeader><CardContent className="space-y-3 pt-3">
          {latestPayslip ? <>
            <p className="font-medium">{isMonthKey(latestPayslip.month) ? new Intl.DateTimeFormat(region.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${latestPayslip.month}-01T00:00:00Z`)) : latestPayslip.month}</p>
            <a href={`/api/payroll/payslips?${new URLSearchParams({ scope: "personal", id: latestPayslip.id, month: latestPayslip.month })}`} className="inline-flex rounded-lg border border-edge px-3 py-2 text-sm font-medium hover:bg-tint">Download PDF</a>
            <Link href="/employee/payslips" className="block text-sm font-medium text-primary hover:underline">View payslip history</Link>
          </> : <p className="text-sm text-muted-foreground">Published payslips will appear here.</p>}
        </CardContent></Card>}
        {announcements && <Card><CardHeader><CardTitle>Company announcements</CardTitle></CardHeader><CardContent className="space-y-3 pt-3">
          {announcements.length > 0 ? <ul className="space-y-2">{announcements.map((post) => <li key={post.id} className="line-clamp-2 break-words text-sm">{post.body}</li>)}</ul> : <p className="text-sm text-muted-foreground">No announcements have been published.</p>}
          <Link href="/employee/feed?view=announcements" className="text-sm font-medium text-primary hover:underline">Open announcements</Link>
        </CardContent></Card>}
      </div>}
      {leave && <EmployeeLeaveActivity recent={leave.recent} next={leave.next} today={today} locale={region.locale} lang={lang} />}
      <details className="rounded-xl border border-edge bg-card p-4">
        <summary className="cursor-pointer py-1 font-semibold"><h2 className="inline">My services</h2></summary>
        <div className="pt-3"><EmployeeServiceDirectory groups={services} /></div>
      </details>
      <EssInstall />
    </div>
  );
}
