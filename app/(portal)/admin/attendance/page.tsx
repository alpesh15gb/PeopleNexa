import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, MapPin, PartyPopper, Timer, Watch } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, timeZoneDayRange } from "@/lib/workspace-time";
import { countsAsLeaveDay } from "@/lib/leave-calendar";
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
import { attendanceDrilldownStatus, attendanceEmployeeScope, attendanceStatusFilter } from "@/lib/attendance-drilldown";

export const dynamic = "force-dynamic";
const PAGE_SIZES = [50, 100, 200, 500] as const;

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string; q?: string; page?: string; size?: string; status?: string; view?: string }>;
}) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee/attendance");
  const { date: dateParam, branch: branchParam, q: queryParam, page: pageParam, size: sizeParam, status: statusParam, view } = await searchParams;
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
  const dailyHref = `/admin/attendance?date=${dateKey}`;
  if (view === "setup" && setupLinks.length > 0) {
    return <div className="space-y-5">
      <PageHeader title="Attendance setup" description="Set work schedules and choose how staff record attendance." actions={<Link href={dailyHref} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Back to daily attendance</Link>} />
      <div className="grid gap-3 sm:grid-cols-2">{setupLinks.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-h-28 items-start gap-3 rounded-xl border border-edge bg-card p-4 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
        </Link>
      ))}</div>
    </div>;
  }

  // Branch filter must belong to this tenant; unknown ids are ignored.
  const branchFilter = isBranchManager
    ? null
    : branchParam
       ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true } })
      : null;
  const branchId = isBranchManager ? ownBranchId : (branchFilter?.id ?? null);
  const query = queryParam?.trim().slice(0, 100) ?? "";
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(sizeParam ?? "50", 10);
  const pageSize = PAGE_SIZES.includes(requestedSize as (typeof PAGE_SIZES)[number]) ? requestedSize : 50;

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

  const [employees, tallyEmployees, holidayCandidates, branches, tallyRecords, tallyLeaves, tallyPunches] = await Promise.all([
    prisma.employee.findMany({
       where: employeeWhere,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
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
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, date: { gte: dayStart, lt: dayEnd }, employee: employeeScope }, select: { employeeId: true, status: true, punchInTime: true } }),
    prisma.leaveRequest.findMany({ where: { tenantId: session.tenantId, status: "approved", fromDate: { lt: dayEnd }, toDate: { gte: dayStart }, employee: employeeScope }, select: { employeeId: true, leavePolicySnapshot: true } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, ...authorizedPunchDayFilter(punchWindow.start, punchWindow.end), employee: employeeScope }, select: { employeeId: true } }),
  ]);

  const employeeIds = employees.map((employee) => employee.id);
  const [records, leaves] = await Promise.all([
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, date: { gte: dayStart, lt: dayEnd } }, include: { branch: { select: { name: true } }, shift: { select: { name: true } } } }),
    prisma.leaveRequest.findMany({ where: { tenantId: session.tenantId, employeeId: { in: employeeIds }, status: "approved", fromDate: { lt: dayEnd }, toDate: { gte: dayStart }, }, include: { employee: { select: { id: true } }, leaveType: true } }),
  ]);

  const leaveByEmp = new Map(leaves.filter((leave) => countsAsLeaveDay(leave.leavePolicySnapshot, dateKey)).map((leave) => [leave.employee.id, leave]));
  const recordByEmp = new Map(records.map((r) => [r.employeeId, r]));

  const rows = employees.map((emp) => {
    const record = recordByEmp.get(emp.id);
    const leave = leaveByEmp.get(emp.id);
    return {
      employeeId: emp.id,
      canEdit: emp.id !== session.sub && dateKey <= today && (!isLocationManager || Boolean(emp.branch)),
      employeeNumber: emp.employeeNumber,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department?.name ?? "Unassigned",
      branch: emp.branch?.name ?? "Unassigned",
      shift: record?.shift?.name ?? emp.shift?.name ?? "—",
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
  const dashboardHref = branchId ? `/admin?branch=${encodeURIComponent(branchId)}` : "/admin";

  const statCards = [
    { label: "Present", value: counts.livePresent, cls: "text-emerald-300" },
    { label: "Late", value: counts.late, cls: "text-amber-300" },
    { label: "Half day", value: counts.halfDay, cls: "text-violet-300" },
    { label: "Permission", value: counts.permission, cls: "text-sky-300" },
    { label: "On leave", value: counts.onLeave, cls: "text-violet-300" },
    { label: "Explicit absent", value: counts.absent, cls: "text-rose-300" },
    { label: "No record", value: counts.noRecord, cls: "text-muted-foreground" },
  ];

  const holidays = holidaysForAttendanceDay(holidayCandidates, dateKey);

  return (
    <div className="animate-fade-up space-y-6">
      {holidays.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-5 py-4">
          <PartyPopper className="h-5 w-5 shrink-0 text-violet-300" />
          <div>
            <p className="font-display text-sm font-semibold text-violet-200">
              {holidays.map((h) => h.name).join(", ")}
            </p>
            <p className="text-[12.5px] text-violet-300/80">
              {holidays.every((holiday) => holiday.isHalfDay) ? "Half-day company holiday" : "Company holiday"}
            </p>
          </div>
        </div>
      )}
      <PageHeader
        title="Attendance"
        description={`${attendanceStatus ? `${attendanceStatus === "present" ? "Present" : "Late"} employees · ` : "Daily attendance for "}${formatCalendarDate(dateKey, region.locale)}${branchId ? ` · ${isBranchManager ? ownBranchName : (branches.find((b) => b.id === branchId)?.name ?? "")}` : ""} · ${region.timeZone}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isBranchManager ? (
              <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                Branch: {ownBranchName}
              </span>
            ) : (
              <BranchPicker branches={branches} value={branchId ?? ""} />
            )}
            <DatePicker value={dateKey} />
          </div>
        }
      />
      <nav className="flex flex-wrap items-center gap-2" aria-label="Attendance workspace">
        <Link href={`/admin/regularization?view=corrections&date=${dateKey}${branchId ? `&branch=${encodeURIComponent(branchId)}` : ""}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge px-3 text-sm font-medium hover:bg-tint">Review corrections</Link>
        <Link href={`/admin/regularization?view=punches&date=${dateKey}${branchId ? `&branch=${encodeURIComponent(branchId)}` : ""}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge px-3 text-sm font-medium hover:bg-tint">Review held punches</Link>
        {setupLinks.length > 0 && <Link href={`${dailyHref}&view=setup`} className="inline-flex min-h-10 items-center rounded-lg border border-edge px-3 text-sm font-medium hover:bg-tint">Attendance setup</Link>}
      </nav>
      {attendanceStatus && <Link href={dashboardHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to dashboard</Link>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {statCards.map((s) => (
          <div key={s.label} className="card-surface rounded-xl px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 pt-0">
          {totalEmployees === 0 ? (
            <EmptyState
              title={query || attendanceStatus ? "No matching attendance" : "No employees in this scope"}
              description={query || attendanceStatus ? "Change the search, date or filters." : "Select another branch or check employee assignments."}
            />
          ) : (
            <AttendanceTable rows={rows} date={dateKey} branchId={branchId ?? ""} query={query} status={attendanceStatus ?? ""} page={page} pageSize={pageSize} totalEmployees={totalEmployees} totalPages={totalPages} region={region} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
