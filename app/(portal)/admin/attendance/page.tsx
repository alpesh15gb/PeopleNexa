import Link from "next/link";
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Clock3, ListChecks, MapPin, PartyPopper, Settings2, Timer, Watch } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, offsetDateKey, timeZoneDayRange } from "@/lib/workspace-time";
import { countsAsLeaveDay } from "@/lib/leave-calendar";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import { istDateKey } from "@/lib/ist";
import { getTenantAccess } from "@/lib/modules-server";
import { managerLocationId } from "@/lib/location-scope";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceTable } from "./attendance-table";
import { DatePicker } from "./date-picker";
import { BranchPicker } from "./branch-picker";
import { EmptyState } from "@/components/ui/stat";
import { holidaysForAttendanceDay, tallyDailyAttendance } from "@/lib/attendance-tally";
import { authorizedPunchDayFilter } from "@/lib/attendance-presence";
import { ATTENDANCE_REVIEW_FLAGS, attendanceDrilldownStatus, attendanceEmployeeScope, attendanceStatusFilter } from "@/lib/attendance-drilldown";
import { ApprovalReview, approvalItemHref } from "../approvals/priority-approvals";
import { ApprovalReceipt } from "../approvals/approval-receipt";

export const dynamic = "force-dynamic";
const PAGE_SIZES = [50, 100, 200, 500] as const;

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string; q?: string; page?: string; size?: string; status?: string; view?: string; item?: string; result?: string }>;
}) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee/attendance");
  const { date: dateParam, branch: branchParam, q: queryParam, page: pageParam, size: sizeParam, status: statusParam, view, item, result } = await searchParams;
  // UI routes fall back to today for a malformed URL instead of rendering a
  // normalized-but-wrong day. APIs reject malformed dates with HTTP 400.
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const region = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const dateKey = dateParam && isDateKey(dateParam) ? dateParam : today;
  const { start: dayStart, end: dayEnd } = dayRangeIST(dateKey);
  const punchWindow = timeZoneDayRange(dateKey, region.timeZone);
  const attendanceStatus = attendanceDrilldownStatus(statusParam);

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const ownLocationId = isLocationManager ? await managerLocationId(session) : null;

  if ((isBranchManager && !ownBranchId) || (isLocationManager && !ownLocationId)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance" />
        <Card><EmptyState title="Attendance scope required" description={`Ask a workspace admin to assign your account to a ${isBranchManager ? "branch" : "location"}.`} /></Card>
      </div>
    );
  }

  const setupAccess = session.role === "admin" || isLocationManager ? (await getTenantAccess(session.tenantId)).modules : null;
  const setupLinks = [
    { module: "shifts", adminOnly: true, href: "/admin/shifts", title: "Work shifts", description: "Define working hours, weekly days off, and overnight shifts.", icon: Timer },
    { module: "rosters", adminOnly: false, href: "/admin/rosters", title: "Shift roster", description: "Assign scheduled shifts to employees for specific dates.", icon: CalendarClock },
    { module: "branches", adminOnly: true, href: "/admin/branches", title: "Worksites and geofences", description: "Set the location and radius used to verify mobile punches.", icon: MapPin },
    { module: "devices", adminOnly: false, href: "/admin/devices", title: "Attendance devices", description: "Manage connected devices and open their punch logs.", icon: Watch },
  ].filter((step) => setupAccess?.has(step.module) && (!step.adminOnly || session.role === "admin"));
  // Setup returns to the same validated daily filters.
  const branchFilter = !isBranchManager && typeof branchParam === "string" && branchParam
    ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true } })
    : null;
  const branchId = isBranchManager ? ownBranchId : branchFilter?.id ?? null;
  const query = typeof queryParam === "string" ? queryParam.trim().slice(0, 100) : "";
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(sizeParam ?? "50", 10);
  const pageSize = PAGE_SIZES.includes(requestedSize as (typeof PAGE_SIZES)[number]) ? requestedSize : 50;
  const dailyParams = new URLSearchParams({ date: dateKey, ...(branchId && { branch: branchId }), ...(query && { q: query }), ...(attendanceStatus && { status: attendanceStatus }), ...(pageSize !== 50 && { size: String(pageSize) }), ...(requestedPage > 1 && { page: String(requestedPage) }) });
  const dailyHref = `/admin/attendance?${dailyParams}`;
  if (view === "setup" && setupLinks.length > 0) {
    return <div className="space-y-5">
      <PageHeader title="Attendance setup" actions={<Link href={dailyHref} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Daily attendance</Link>} />
      <div className="grid gap-3 sm:grid-cols-2">{setupLinks.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-h-28 items-start gap-3 rounded-xl border border-edge bg-card p-4 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
        </Link>
      ))}</div>
    </div>;
  }

  const employeeScope = attendanceEmployeeScope({ tenantId: session.tenantId, locationId: ownLocationId, branchId });
  // An employee/day is unique; filtering employees by their exact day record keeps
  // this drilldown distinct and aligned with the dashboard tally buckets.
  const statusScope = attendanceStatus ? attendanceStatusFilter(attendanceStatus, dayStart, dayEnd, punchWindow) : {};
  const employeeWhere = query
    ? { ...employeeScope, ...statusScope, AND: query.split(/\s+/).filter(Boolean).map((term) => ({ OR: [{ firstName: { contains: term, mode: "insensitive" as const } }, { lastName: { contains: term, mode: "insensitive" as const } }, { employeeNumber: { contains: term, mode: "insensitive" as const } }] })) }
    : { ...employeeScope, ...statusScope };
  const totalEmployees = await prisma.employee.count({ where: employeeWhere });
  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const reviewParams = new URLSearchParams(dailyParams);
  if (requestedPage !== page) reviewParams.set("page", String(page));
  const reviewListHref = `/admin/attendance?${reviewParams}`;

  const [employees, tallyEmployees, holidayCandidates, branches, tallyRecords, tallyLeaves, tallyPunches] = await Promise.all([
    prisma.employee.findMany({
       where: employeeWhere,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        joiningDate: true,
        department: { select: { name: true } },
        branch: { select: { name: true } },
        shift: { select: { name: true, startTime: true } },
      },
       orderBy: { employeeNumber: "asc" },
       skip: (page - 1) * pageSize,
       take: pageSize,
     }),
    prisma.employee.findMany({ where: employeeScope, select: { id: true } }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId, OR: [{ isRecurring: true }, { date: { gte: dayStart, lt: dayEnd } }] } }),
    prisma.branch.findMany({
       where: { tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) },
      select: { id: true, name: true },
       orderBy: { name: "asc" },
    }),
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, date: { gte: dayStart, lt: dayEnd }, employee: employeeScope }, select: { employeeId: true, status: true, punchInTime: true, reviewStatus: true } }),
    prisma.leaveRequest.findMany({ where: { tenantId: session.tenantId, status: "approved", fromDate: { lt: dayEnd }, toDate: { gte: dayStart }, employee: employeeScope }, select: { employeeId: true, leavePolicySnapshot: true } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, ...authorizedPunchDayFilter(punchWindow.start, punchWindow.end), employee: employeeScope }, select: { employeeId: true } }),
  ]);

  const employeeIds = employees.map((employee) => employee.id);
  const reviewer = await pendingApprovalFilters(session);
  const reviewScope = branchId ? { employee: { branchId } } : {};
  const reviewDate = { date: { gte: dayStart, lt: dayEnd } };
  const reviewableCorrection = reviewer.correction ? { AND: [reviewer.correction, reviewDate, { employeeId: { in: employeeIds } }] } : undefined;
  const [records, leaves, rosters, openCorrections, heldPunches, pendingCorrections] = await Promise.all([
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, date: { gte: dayStart, lt: dayEnd } }, include: { branch: { select: { name: true } }, shift: { select: { name: true } } } }),
    prisma.leaveRequest.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, status: "approved", fromDate: { lt: dayEnd }, toDate: { gte: dayStart }, }, include: { employee: { select: { id: true } }, leaveType: true } }),
    prisma.rosterAssignment.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, date: dayStart }, select: { employeeId: true, shift: { select: { name: true } } } }),
    reviewer.correction ? prisma.punchCorrection.count({ where: { AND: [reviewer.correction, reviewScope, reviewDate] } }) : 0,
    reviewer.heldPunch ? prisma.punch.count({ where: { AND: [reviewer.heldPunch, reviewScope, { punchTime: { gte: punchWindow.start, lt: punchWindow.end } }] } }) : 0,
    reviewableCorrection ? prisma.punchCorrection.findMany({ where: reviewableCorrection, select: { id: true, employeeId: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], distinct: ["employeeId"] }) : [],
  ]);
  const received = new Set(tallyPunches.map((punch) => punch.employeeId));
  const rosterByEmp = new Map(rosters.map(({ employeeId, shift }) => [employeeId, shift.name]));

  const leaveByEmp = new Map(leaves.filter((leave) => countsAsLeaveDay(leave.leavePolicySnapshot, dateKey)).map((leave) => [leave.employee.id, leave]));
  const recordByEmp = new Map(records.map((r) => [r.employeeId, r]));
  const correctionByEmp = new Map(pendingCorrections.map(({ employeeId, id }) => [employeeId, id]));

  const rows = employees.map((emp) => {
    const record = recordByEmp.get(emp.id);
    const leave = leaveByEmp.get(emp.id);
    const correctionId = correctionByEmp.get(emp.id);
    return {
      employeeId: emp.id,
      correctionHref: correctionId ? approvalItemHref(`correction.${correctionId}`, reviewListHref) : null,
      canEdit: emp.id !== session.sub && dateKey <= today && (!emp.joiningDate || istDateKey(emp.joiningDate) <= dateKey) && (!isLocationManager || Boolean(emp.branch)),
      employeeNumber: emp.employeeNumber,
      punchReceived: received.has(emp.id),
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department?.name ?? "Unassigned",
      branch: emp.branch?.name ?? "Unassigned",
      shift: record?.shift?.name ?? rosterByEmp.get(emp.id) ?? emp.shift?.name ?? "—",
      record: record
        ? {
            id: record.id,
            punchIn: formatWorkspaceTime(record.punchInTime, region),
            punchOut: formatWorkspaceTime(record.punchOutTime, region),
            lateMinutes: record.lateMinutes,
            status: record.status,
            note: record.note,
            reviewStatus: record.reviewStatus,
            punches: (record.punches as Array<{ id: string; time: string; source: string; type: string; deviceSn?: string | null }> | null) ?? null,
          }
        : null,
      leave: leave ? { type: leave.leaveType.name, color: leave.leaveType.color } : null,
    };
  });

  const counts = tallyDailyAttendance(tallyEmployees.map((employee) => employee.id), tallyRecords, tallyLeaves.filter((leave) => countsAsLeaveDay(leave.leavePolicySnapshot, dateKey)).map((leave) => leave.employeeId), tallyPunches.map((punch) => punch.employeeId));
  const dayHref = (day: string, status: string | null = attendanceStatus) => `/admin/attendance?${new URLSearchParams({ date: day, ...(branchId && { branch: branchId }), ...(query && { q: query }), ...(status && { status }), ...(pageSize !== 50 && { size: String(pageSize) }) })}`;
  const queueParams = new URLSearchParams({ date: dateKey, ...(branchId && { branch: branchId }) });
  const scopeLabel = branchId ? isBranchManager ? ownBranchName : branches.find((branch) => branch.id === branchId)?.name : isLocationManager ? "Assigned location" : "All branches";
  const reviewCount = tallyRecords.filter((record) => ATTENDANCE_REVIEW_FLAGS.includes(record.reviewStatus ?? "")).length;
  const summary = [
    { label: "Employees", value: counts.total, status: null },
    { label: "With punches", value: counts.livePresent, status: "present" },
    { label: "Late", value: counts.late, status: "late" },
    { label: "Needs review", value: reviewCount, status: "needs_review" },
  ];
  const recorded = [
    { label: "Present", value: counts.present }, { label: "Half day", value: counts.halfDay },
    { label: "Permission", value: counts.permission }, { label: "On leave", value: counts.onLeave },
    { label: "Marked absent", value: counts.absent }, { label: "No attendance record", value: counts.noRecord },
  ];
  const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-edge bg-card px-3 text-sm font-medium hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const holidays = holidaysForAttendanceDay(holidayCandidates, dateKey);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Daily attendance" description={`${formatCalendarDate(dateKey, region.locale)} · ${scopeLabel ?? "Branch"} · ${region.timeZone}`}
        actions={setupLinks.length > 0 ? <Link href={`${dailyHref}&view=setup`} className={buttonClass}><Settings2 className="h-4 w-4" aria-hidden="true" /> Setup</Link> : undefined}
      />
      {typeof result === "string" && reviewer.correction && <ApprovalReceipt result={result} tenantId={session.tenantId} actorId={session.sub} backHref={reviewListHref} region={region} correctionScope={{ ...reviewDate, employee: { AND: [reviewer.correction.employee ?? {}, employeeScope] } }} />}
      <section aria-label="Attendance day and branch" className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-edge bg-card p-3 sm:p-4">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Work date</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={dayHref(offsetDateKey(dateKey, -1))} aria-label="Previous attendance day" className={`${buttonClass} px-2.5`}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
            <DatePicker value={dateKey} />
            {dateKey < today && <Link href={dayHref(offsetDateKey(dateKey, 1))} aria-label="Next attendance day" className={`${buttonClass} px-2.5`}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}
            {dateKey !== today && <Link href={dayHref(today)} className={buttonClass}>Today</Link>}
          </div>
        </div>
        {!isBranchManager && branches.length > 0 && <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Branch</p>
          <BranchPicker branches={branches} value={branchId ?? ""} />
        </div>}
      </section>
      {holidays.length > 0 && <div className="flex items-center gap-2 rounded-xl border border-edge bg-tint px-4 py-2.5 text-sm">
        <PartyPopper className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p><strong>{holidays.every((holiday) => holiday.isHalfDay) ? "Half-day holiday" : "Company holiday"}</strong> · {holidays.map((holiday) => holiday.name).join(", ")}</p>
      </div>}

      <section aria-label="Attendance overview" className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {summary.map(({ label, value, status }) => (
            <Link key={label} href={dayHref(dateKey, status)} aria-current={attendanceStatus === status ? "page" : undefined}
              className={`rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4 ${attendanceStatus === status ? "border-primary/40 bg-primary/5" : "border-edge bg-card hover:border-primary/30"}`}>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{value.toLocaleString(region.locale)}</p>
            </Link>
          ))}
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Attendance review queues">
          <Link href={`/admin/regularization?${queueParams}&view=corrections`} className={buttonClass}><ListChecks className="h-4 w-4" aria-hidden="true" /> Corrections <span className="tabular-nums text-muted-foreground" aria-label={`${openCorrections} pending`}>{openCorrections}</span></Link>
          <Link href={`/admin/regularization?${queueParams}&view=punches`} className={buttonClass}><Clock3 className="h-4 w-4" aria-hidden="true" /> Held punches <span className="tabular-nums text-muted-foreground" aria-label={`${heldPunches} pending`}>{heldPunches}</span></Link>
        </nav>
        <details className="rounded-lg border border-edge bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Recorded statuses</summary>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recorded.map(({ label, value }) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value.toLocaleString(region.locale)}</dd></div>)}
          </dl>
        </details>
      </section>

      <Card>
        <CardContent className="p-0 sm:p-0">
          <AttendanceTable rows={rows} date={dateKey} branchId={branchId ?? ""} query={query} status={attendanceStatus ?? ""} page={page} pageSize={pageSize} totalEmployees={totalEmployees} totalPages={totalPages} region={region} />
        </CardContent>
      </Card>
      {typeof item === "string" && <ApprovalReview selectedKey={item} backHref={reviewListHref} correction={reviewableCorrection} region={region} />}
    </div>
  );
}
