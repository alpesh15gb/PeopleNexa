import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarClock, Users, UserCheck, Clock4, ShieldAlert, CalendarCheck2, TimerOff, IdCard, ChevronLeft, ChevronRight, PartyPopper, Fingerprint, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { getTenantAccess } from "@/lib/modules-server";
import { employeeLocationScope } from "@/lib/location-scope";
import { dayRangeIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, offsetDateKey, timeZoneDayRange } from "@/lib/workspace-time";
import { EmptyState, StatCard } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { WeekChart } from "./week-chart";
import { DepartmentBars } from "./department-bars";
import { tallyDailyAttendance, type AttendanceTally } from "@/lib/attendance-tally";
import { authorizedPunchDayFilter, dailyPresentEmployeeCounts } from "@/lib/attendance-presence";
import { dashboardLayout, defaultDashboardWidgets, resolveConfiguration, type DashboardWidgetKey, type DashboardWidgetSize } from "@/lib/configuration";
import { payrollScopeHref } from "@/lib/payroll-work-queue";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import { recordPageNumber, type RecordSearchParams } from "@/lib/document-expense-pagination";

export const dynamic = "force-dynamic";

// Token-driven stat sizing: tabular numerals, truncated values, responsive sizes.
// Applied via className passthrough since StatCard internals live in components/*.
const statCardClass =
  "h-full min-w-0 tabular-nums [&_.font-display]:truncate [&_.font-display]:text-[24px] sm:[&_.font-display]:text-[28px] xl:[&_.font-display]:text-[30px]";

const metricWidgets = new Set<DashboardWidgetKey>([
  "total_employees", "present", "late", "permission", "absent", "on_leave", "pending_leaves",
]);

function dashboardWidgetColumns(key: DashboardWidgetKey, size: DashboardWidgetSize) {
  if (size === "wide") return "min-w-0 col-span-2 md:col-span-6 xl:col-span-12";
  if (metricWidgets.has(key)) return "min-w-0 col-span-1 md:col-span-2 xl:col-span-2";
  if (size === "compact") return "min-w-0 col-span-2 md:col-span-2 xl:col-span-3";
  return "min-w-0 col-span-2 md:col-span-3 xl:col-span-6";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<RecordSearchParams>;
}) {
  const session = await requireActiveSession();
  const params = await searchParams;
  const branchParam = typeof params.branch === "string" ? params.branch : undefined;

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true, locationId: true } } } })
    : null;
  const ownLocationId = isLocationManager ? (await prisma.employee.findUnique({ where: { id: session.sub }, select: { locationId: true } }))?.locationId ?? null : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  if ((isBranchManager && !ownBranchId) || (isLocationManager && !ownLocationId)) {
    return <EmptyState title="Workspace assignment needed" description="Ask your administrator to assign your branch or location." />;
  }
  const [{ modules }, tenant] = await Promise.all([
    getTenantAccess(session.tenantId),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const region = workspaceRegion(tenant?.config);
  const toPunchDateKey = (date: Date) => dateKeyInTimeZone(date, region.timeZone);
  const todayKey = toPunchDateKey(new Date());
  const { start: today, end: tomorrow } = dayRangeIST(todayKey);
  const punchWindow = timeZoneDayRange(todayKey, region.timeZone);
  const todayLabel = formatCalendarDate(todayKey, region.locale);
  const dateLabel = (date: Date) => formatCalendarDate(istDateKey(date), region.locale);
  const canSeeAttendance = modules.has("attendance");
  const canSeeLeaves = modules.has("leaves");
  const canSeePeople = modules.has("employees");
  const canReview = canSeeAttendance || canSeeLeaves || (!isBranchManager && (modules.has("expenses") || modules.has("exit")));

  // Branch filter must belong to this tenant; unknown ids are ignored.
  const branchFilter = isBranchManager
    ? (ownBranchId ? { id: ownBranchId, name: ownBranchName } : null)
      : branchParam
       ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true, name: true, locationId: true } })
      : null;
  const branchId = isBranchManager ? ownBranchId : (branchFilter?.id ?? null);
  const selectedBranchLocationId = branchFilter && "locationId" in branchFilter ? branchFilter.locationId : null;
  const dashboardLocationId = ownLocationId ?? (isBranchManager ? ownScope?.branch?.locationId ?? null : selectedBranchLocationId);
  const layoutEditorHref = `/admin/configuration?${new URLSearchParams({ section: "dashboard", ...(dashboardLocationId ? { location: dashboardLocationId } : {}) })}#dashboard-layouts`;
  const branchScope: Record<string, string> = branchId && !isBranchManager ? { branch: branchId } : {};
  const attendanceScope = new URLSearchParams({ date: todayKey, ...branchScope });
  const leaveReviewHref = `/admin/leaves?${new URLSearchParams({ status: "needs_review", ...branchScope })}`;
  const correctionReviewHref = `/admin/regularization?${new URLSearchParams({ view: "corrections", ...branchScope })}`;
  const activeDashboardRecords = await prisma.configurationRecord.findMany({
    where: { tenantId: session.tenantId, kind: "dashboard", active: true },
    select: { locationId: true, active: true, effectiveFrom: true, effectiveTo: true, payload: true },
  });
  // Invalid records are ignored so an existing dashboard always remains usable.
  const activeDashboardLayout = dashboardLayout(resolveConfiguration(activeDashboardRecords.filter((record) => dashboardLayout(record.payload)), dashboardLocationId)?.payload);
  const layout = activeDashboardLayout?.widgets ?? defaultDashboardWidgets();
  const visibleWidgets = layout.filter(({ key, enabled }) => {
    if (!enabled) return false;
    if (key === "on_leave" || key === "pending_leaves" || key === "pending_leave_requests") {
      if (!canSeeLeaves) return false;
    } else if (["total_employees", "driving_license_expiry", "birthdays", "anniversaries", "new_joiners", "departments", "gender_ratio"].includes(key)) {
      if (!canSeePeople) return false;
    } else if (!canSeeAttendance || (key === "device_attendance" && !modules.has("devices"))) {
      return false;
    }
    return true;
  });
  const widgetEnabled = (key: DashboardWidgetKey) => visibleWidgets.some((widget) => widget.key === key);
  const locationEmployeeScope = ownLocationId ? employeeLocationScope(ownLocationId) : {};
  const empScope = { tenantId: session.tenantId, status: "active", loginOnly: false, ...locationEmployeeScope, ...(branchId ? { branchId } : {}) };
  const currentMonth = todayKey.slice(0, 7);
  const attendancePageSize = 25;
  const requestedPage = recordPageNumber(params.attendancePage) ?? 1;
  const [year, month] = currentMonth.split("-").map(Number);
  const currentMonthStart = dayRangeIST(`${currentMonth}-01`).start;
  const monthPunchStart = timeZoneDayRange(`${currentMonth}-01`, region.timeZone).start;
  const previousMonthStart = dayRangeIST(new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10)).start;
  const nextMonthStart = dayRangeIST(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)).start;
  const licenseExpiryStart = new Date(Date.UTC(year, month - 1, 1));
  const licenseExpiryEnd = new Date(Date.UTC(year, month, 1));

  const attendanceWhere = {
    tenantId: session.tenantId,
    date: { gte: today, lt: tomorrow },
    employee: empScope,
  };
  const reviewFilters = canReview ? await pendingApprovalFilters(session) : {};
  const requestedBranch = branchId ? { employee: { branchId } } : {};
  const pendingLeaveWhere = reviewFilters.leave ? { AND: [reviewFilters.leave, requestedBranch] } : { id: { in: [] } };
  const [employees, attendance, approvedLeaves, departments, pendingLeaves, pendingLeaveCount, correctionCount, branches, expiringLicenses, newJoiners, celebrationProfiles, todayPunches] = await Promise.all([
    prisma.employee.findMany({
      where: empScope,
      select: { id: true, department: { select: { name: true } }, branch: { select: { id: true, name: true } }, profile: { select: { gender: true } } },
    }),
    canSeeAttendance ? prisma.attendance.findMany({
      where: attendanceWhere,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } },
      },
      orderBy: { punchInTime: "asc" },
    }) : [],
    canSeeLeaves && (canSeeAttendance || widgetEnabled("on_leave")) ? prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, status: "approved", fromDate: { lt: tomorrow }, toDate: { gte: today }, employee: empScope },
      select: { employeeId: true },
    }) : [],
    widgetEnabled("departments") ? prisma.department.findMany({
      where: {
        tenantId: session.tenantId,
        ...((branchId || ownLocationId) ? { employees: { some: empScope } } : {}),
      },
    }) : [],
    widgetEnabled("pending_leave_requests") ? prisma.leaveRequest.findMany({
      where: pendingLeaveWhere,
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: [{ appliedAt: "desc" }, { id: "asc" }],
      take: 4,
    }) : [],
    canSeeLeaves && reviewFilters.leave ? prisma.leaveRequest.count({ where: pendingLeaveWhere }) : 0,
    canSeeAttendance && reviewFilters.correction ? prisma.punchCorrection.count({ where: { AND: [reviewFilters.correction, requestedBranch] } }) : 0,
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    widgetEnabled("driving_license_expiry") ? prisma.employee.findMany({
      where: {
        ...empScope,
        drivingLicenseExpiresAt: { gte: licenseExpiryStart, lt: licenseExpiryEnd },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        drivingLicenseExpiresAt: true,
        branch: { select: { name: true } },
      },
      orderBy: { drivingLicenseExpiresAt: "asc" },
    }) : [],
    widgetEnabled("new_joiners") ? prisma.employee.findMany({
      where: { ...empScope, joiningDate: { gte: previousMonthStart, lt: nextMonthStart } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true, position: true, branch: { select: { name: true } } },
      orderBy: { joiningDate: "desc" },
    }) : [],
    widgetEnabled("birthdays") || widgetEnabled("anniversaries") ? prisma.employeeProfile.findMany({
      where: { employee: empScope, OR: [{ dateOfBirthCertificate: { not: null } }, { actualDateOfBirth: { not: null } }, { marriageDate: { not: null } }] },
      select: { dateOfBirthCertificate: true, actualDateOfBirth: true, marriageDate: true, employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, branch: { select: { name: true } } } } },
    }) : [],
    canSeeAttendance ? prisma.punch.findMany({
      where: { tenantId: session.tenantId, ...authorizedPunchDayFilter(punchWindow.start, punchWindow.end), employee: empScope },
      select: { employeeId: true, punchTime: true, authStatus: true, employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } } },
      orderBy: { punchTime: "asc" },
    }) : [],
  ]);

  const [weekRows, weekPunches] = widgetEnabled("attendance_trend") ? await Promise.all([
    prisma.attendance.findMany({ where: { tenantId: session.tenantId, date: { gte: currentMonthStart, lt: tomorrow }, employee: empScope }, select: { employeeId: true, date: true, status: true } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, ...authorizedPunchDayFilter(monthPunchStart, punchWindow.end), employee: empScope }, select: { employeeId: true, punchTime: true, authStatus: true } }),
  ]) : [[], []];

  const counts = tallyDailyAttendance(employees.map((employee) => employee.id), attendance, approvedLeaves.map((leave) => leave.employeeId), todayPunches.map((punch) => punch.employeeId));
  const payScope = { locationId: dashboardLocationId, period: currentMonth };
  const workflowLinks = [
    ...(canSeeAttendance ? [{
      title: "Attendance", icon: CalendarClock,
      summary: `${counts.livePresent.toLocaleString(region.locale)} of ${counts.total.toLocaleString(region.locale)} active employees clocked in`,
      primary: { href: `/admin/attendance?${attendanceScope}`, label: "View today’s records" },
      secondary: { href: correctionReviewHref, label: `Review corrections (${correctionCount})` },
      setup: session.role === "admin" ? { href: `/admin/attendance?${new URLSearchParams({ view: "setup", ...branchScope })}`, label: "Attendance setup" } : null,
    }] : []),
    ...(canSeeLeaves ? [{
      title: "Leave", icon: CalendarCheck2,
      summary: `${pendingLeaveCount.toLocaleString(region.locale)} ${pendingLeaveCount === 1 ? "request needs" : "requests need"} review`,
      primary: { href: leaveReviewHref, label: "Review leave requests" },
      secondary: { href: `/admin/leaves?${new URLSearchParams({ view: "calendar", ...branchScope })}`, label: "Open leave calendar" },
      setup: session.role === "admin" ? { href: "/admin/leaves/policies", label: "Leave policies" } : null,
    }] : []),
    ...(!isBranchManager && modules.has("payroll") ? [{
      title: "Payroll", icon: Banknote,
      summary: `${new Intl.DateTimeFormat(region.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${currentMonth}-01T00:00:00Z`))} · ${region.currency}`,
      primary: { href: payrollScopeHref("/admin/payroll/queue", payScope), label: "Open payroll work queue" },
      secondary: { href: payrollScopeHref("/admin/payroll", payScope), label: "View monthly payroll" },
      setup: session.role === "admin" ? { href: payrollScopeHref("/admin/payroll/configuration", payScope), label: "Payroll setup" } : null,
    }] : []),
  ];
  const maleEmployees = employees.filter((employee) => employee.profile?.gender?.toLowerCase() === "male").length;
  const femaleEmployees = employees.filter((employee) => employee.profile?.gender?.toLowerCase() === "female").length;
  const reportedGenderTotal = maleEmployees + femaleEmployees;
  const attendanceHref = (page: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    params.set("attendancePage", String(page));
    return `/admin?${params.toString()}`;
  };
  const attendanceDrilldownHref = (status: "present" | "late") => {
    const params = new URLSearchParams({ date: todayKey, status });
    if (branchId) params.set("branch", branchId);
    return `/admin/attendance?${params.toString()}`;
  };
  const currentMonthJoiners = newJoiners.filter((employee) => employee.joiningDate && employee.joiningDate >= currentMonthStart);
  const previousMonthJoiners = newJoiners.filter((employee) => employee.joiningDate && employee.joiningDate < currentMonthStart);
  const todayMonthDay = todayKey.slice(5);
  const birthdays = celebrationProfiles.filter((profile) => {
    const birthday = profile.actualDateOfBirth ?? profile.dateOfBirthCertificate;
    return birthday && istDateKey(birthday).slice(5) === todayMonthDay;
  });
  const anniversaries = celebrationProfiles.filter((profile) => profile.marriageDate && istDateKey(profile.marriageDate).slice(5) === todayMonthDay);
  const devicePunches = widgetEnabled("device_attendance")
    ? await prisma.punch.findMany({
        where: {
          tenantId: session.tenantId, ...authorizedPunchDayFilter(punchWindow.start, punchWindow.end), employee: empScope,
          OR: [{ deviceId: { not: null } }, { realtimeDeviceId: { not: null } }],
        },
        select: { employeeId: true, device: { select: { name: true } }, realtimeDevice: { select: { name: true } } },
      })
    : [];
  const deviceEmployees = new Map<string, Set<string>>();
  for (const punch of devicePunches) { const name = punch.device?.name ?? punch.realtimeDevice?.name ?? "Unidentified device"; const employees = deviceEmployees.get(name) ?? new Set<string>(); employees.add(punch.employeeId); deviceEmployees.set(name, employees); }
  const deviceAttendance = new Map([...deviceEmployees].map(([name, employees]) => [name, employees.size]));
  const branchAttendance: Array<{ id: string; name: string; tally: AttendanceTally }> = [];
  if (widgetEnabled("project_attendance")) {
    const branchesById = new Map<string, {
      id: string;
      name: string;
      employeeIds: string[];
      records: Array<(typeof attendance)[number]>;
      leaveIds: string[];
      punchIds: string[];
    }>();
    const employeeBranch = new Map<string, string>();
    for (const employee of employees) {
      const id = employee.branch?.id ?? "unassigned";
      const branch = branchesById.get(id) ?? {
        id, name: employee.branch?.name ?? "Unassigned", employeeIds: [], records: [], leaveIds: [], punchIds: [],
      };
      branch.employeeIds.push(employee.id);
      branchesById.set(id, branch);
      employeeBranch.set(employee.id, id);
    }
    const branchFor = (employeeId: string) => branchesById.get(employeeBranch.get(employeeId) ?? "");
    for (const record of attendance) branchFor(record.employeeId)?.records.push(record);
    for (const leave of approvedLeaves) branchFor(leave.employeeId)?.leaveIds.push(leave.employeeId);
    for (const punch of todayPunches) branchFor(punch.employeeId)?.punchIds.push(punch.employeeId);
    for (const { id, name, employeeIds, records, leaveIds, punchIds } of branchesById.values()) {
      branchAttendance.push({ id, name, tally: tallyDailyAttendance(employeeIds, records, leaveIds, punchIds) });
    }
    branchAttendance.sort((a, b) => b.tally.total - a.tally.total || a.name.localeCompare(b.name));
  }

  const week = [];
  const presentByDay = dailyPresentEmployeeCounts(weekRows, weekPunches, toPunchDateKey);
  const tally = new Map<string, { late: number; absent: number }>();
  const clockedIn = new Set(weekPunches.map((punch) => `${toPunchDateKey(punch.punchTime)}:${punch.employeeId}`));
  for (const r of weekRows) {
    const key = istDateKey(r.date);
    const cur = tally.get(key) ?? { late: 0, absent: 0 };
    if (r.status === "late") cur.late++;
    if (r.status === "absent" && !clockedIn.has(`${key}:${r.employeeId}`)) cur.absent++;
    tally.set(key, cur);
  }
  const monthDayCount = Math.round((today.getTime() - currentMonthStart.getTime()) / 86_400_000);
  const chartDate = new Intl.DateTimeFormat(region.locale, { timeZone: "UTC", month: "numeric", day: "numeric" });
  for (let i = monthDayCount; i >= 0; i--) {
    const dayKey = offsetDateKey(todayKey, -i);
    const t = tally.get(dayKey) ?? { late: 0, absent: 0 };
    week.push({ day: dayKey, label: chartDate.format(new Date(`${dayKey}T00:00:00Z`)), ...t, present: (presentByDay.get(dayKey) ?? 0) - t.late });
  }
  const attendanceByEmployee = new Map(attendance.map((row) => [row.employeeId, row]));
  const rawOnlyAttendance = new Map<string, typeof attendance[number]>();
  for (const punch of todayPunches) {
    if (!attendanceByEmployee.has(punch.employeeId) && !rawOnlyAttendance.has(punch.employeeId)) {
      rawOnlyAttendance.set(punch.employeeId, {
        id: `punch-${punch.employeeId}`,
        employeeId: punch.employeeId,
        punchInTime: punch.punchTime,
        punchOutTime: null,
        status: "present",
        employee: punch.employee,
      } as typeof attendance[number]);
    }
  }
  const liveAttendance = [...attendance, ...rawOnlyAttendance.values()].sort((a, b) => (a.punchInTime?.getTime() ?? 0) - (b.punchInTime?.getTime() ?? 0));
  const attendanceTotal = liveAttendance.length;
  const attendancePageCount = Math.max(1, Math.ceil(attendanceTotal / attendancePageSize));
  const attendancePage = Math.min(requestedPage, attendancePageCount);
  const pagedAttendance = liveAttendance.slice((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize);
  const widgetContents: Record<DashboardWidgetKey, ReactNode> = {
    total_employees: <StatCard label="Active employees" value={counts.total} icon={<Users className="h-4.5 w-4.5" />} tone="indigo" className={statCardClass} />,
    present: (
      <Link href={attendanceDrilldownHref("present")} aria-label={`View ${counts.livePresent} employees who clocked in`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatCard label="Clocked in" value={counts.livePresent} icon={<UserCheck className="h-4.5 w-4.5" />} tone="emerald" className={`${statCardClass} group-hover:border-emerald-400/40 group-hover:shadow-[0_14px_32px_-24px_rgba(16,185,129,0.55)]`} /></Link>
    ),
    late: (
      <Link href={attendanceDrilldownHref("late")} aria-label={`View ${counts.late} late employees`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatCard label="Late" value={counts.late} icon={<Clock4 className="h-4.5 w-4.5" />} tone="amber" className={`${statCardClass} group-hover:border-amber-400/40 group-hover:shadow-[0_14px_32px_-24px_rgba(245,158,11,0.55)]`} /></Link>
    ),
    permission: <StatCard label="Permission" value={counts.permission} icon={<ShieldAlert className="h-4.5 w-4.5" />} tone="sky" className={statCardClass} />,
    absent: <StatCard label="Absent" value={counts.absent} icon={<TimerOff className="h-4.5 w-4.5" />} tone="rose" className={statCardClass} />,
    pending_leaves: (
      <Link href={leaveReviewHref} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><StatCard
          label="Pending leave requests"
          value={pendingLeaveCount}
          icon={<CalendarCheck2 className="h-4.5 w-4.5" />}
          tone="violet"
          className={statCardClass}
         /></Link>
    ),
    attendance_trend: (
      <Card className="h-full">
         <CardHeader>
           <div>
             <CardTitle>Attendance this month</CardTitle>
             <CardDescription>Daily attendance trend through {todayLabel}</CardDescription>
           </div>
         </CardHeader>
         <CardContent className="pt-0">
           <WeekChart data={week} />
         </CardContent>
       </Card>
    ),
    device_attendance: (
      <Card className="h-full"><CardHeader><div><CardTitle>Biometric device attendance</CardTitle><CardDescription>Distinct active employees who punched today</CardDescription></div><Fingerprint className="h-4.5 w-4.5 text-primary" /></CardHeader><CardContent>{deviceAttendance.size ? <div className="divide-y divide-edge">{[...deviceAttendance.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => <div key={name} className="flex items-center justify-between py-2.5 text-sm"><span>{name}</span><strong className="font-mono">{count} employees</strong></div>)}</div> : <p className="py-4 text-center text-sm text-muted-foreground">No biometric attendance today.</p>}</CardContent></Card>
    ),
    project_attendance: (
      <Card className="h-full">
        <CardHeader><div><CardTitle>Attendance by branch</CardTitle><CardDescription>Today&apos;s attendance by branch</CardDescription></div><Building2 aria-hidden="true" className="h-4.5 w-4.5 text-primary" /></CardHeader>
        <CardContent>
          {branchAttendance.length ? (
            <ul className="divide-y divide-edge">
              {branchAttendance.map(({ id, name, tally: count }) => {
                const rowClass = "flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm";
                const totals = <span className="tabular-nums text-muted-foreground">{count.livePresent}/{count.total} clocked in · {count.absent} absent</span>;
                return <li key={id}>
                  {id === "unassigned" ? <div className={rowClass}><span>{name}</span>{totals}</div> : (
                    <Link href={`/admin/attendance?${new URLSearchParams({ date: todayKey, branch: id })}`} className={`${rowClass} hover:bg-tint focus-visible:ring-2 focus-visible:ring-ring`}>
                      <span className="min-w-0 wrap-break-word font-medium text-primary">{name}</span>
                      {totals}
                    </Link>
                  )}
                </li>;
              })}
            </ul>
          ) : <p className="py-4 text-center text-sm text-muted-foreground">No attendance by branch today.</p>}
        </CardContent>
      </Card>
    ),
    todays_attendance: (
      <Card className="h-full">
          <CardHeader>
            <div>
              <CardTitle>Today&apos;s attendance</CardTitle>
               <CardDescription>{attendanceTotal} attendance entries · {counts.onLeave} on leave · {counts.noRecord} no record · {todayLabel}</CardDescription>
            </div>
            <CalendarClock className="h-4.5 w-4.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-4">
             {pagedAttendance.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="No one has clocked in yet"
                description="Punches will appear here in real time as employees check in."
              />
            ) : (
              <>
                <div className="divide-y divide-[color:var(--border)]">
                 {pagedAttendance.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                      {(a.employee.firstName[0] ?? "") + (a.employee.lastName[0] ?? "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">
                        {a.employee.firstName} {a.employee.lastName}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {a.employee.employeeNumber} · {a.employee.department?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[13px] font-semibold">
                        {formatWorkspaceTime(a.punchInTime, region)}
                        {a.punchOutTime && <span className="text-muted-foreground"> → {formatWorkspaceTime(a.punchOutTime, region)}</span>}
                      </p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                ))}
                </div>
                {attendancePageCount > 1 && (
                <nav aria-label="Today&apos;s attendance pages" className="mt-4 flex items-center justify-between border-t border-edge pt-3">
                  {attendancePage > 1 ? (
                    <Link href={attendanceHref(attendancePage - 1)} scroll={false} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                    </Link>
                  ) : <span className="inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground/50">Previous</span>}
                  <span className="text-xs font-medium text-muted-foreground" aria-current="page">Page {Math.min(attendancePage, attendancePageCount)} of {attendancePageCount}</span>
                  {attendancePage < attendancePageCount ? (
                    <Link href={attendanceHref(attendancePage + 1)} scroll={false} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                      Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : <span className="inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground/50">Next</span>}
                </nav>
                )}
              </>
            )}
          </CardContent>
        </Card>
    ),
    driving_license_expiry: (
      <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle>Driving license expiry</CardTitle>
                <CardDescription>{expiringLicenses.length} employee{expiringLicenses.length === 1 ? "" : "s"} expiring in {currentMonth}</CardDescription>
              </div>
              <IdCard className="h-4.5 w-4.5 text-amber-600" />
            </CardHeader>
            <CardContent className="pt-1">
              {expiringLicenses.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted-foreground">No driving licenses expire this month.</p>
              ) : (
                <div className="divide-y divide-[color:var(--border)]">
                  {expiringLicenses.map((employee) => (
                    <Link key={employee.id} href="/admin/employees" className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{employee.firstName} {employee.lastName}</p>
                        <p className="truncate text-[11.5px] text-muted-foreground">{employee.employeeNumber} · {employee.branch?.name ?? "Unassigned"}</p>
                      </div>
                      <time dateTime={employee.drivingLicenseExpiresAt!.toISOString()} className="shrink-0 font-mono text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                        {dateLabel(employee.drivingLicenseExpiresAt!)}
                      </time>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
    ),
    birthdays: (
      <Card className="h-full">
            <CardHeader>
              <div><CardTitle>Today&apos;s birthdays</CardTitle><CardDescription>{birthdays.length} celebration{birthdays.length === 1 ? "" : "s"} today</CardDescription></div>
              <PartyPopper className="h-4.5 w-4.5 text-amber-500" />
            </CardHeader>
            <CardContent className="pt-1">
              {birthdays.length === 0 ? <p className="py-3 text-center text-[13px] text-muted-foreground">No birthdays today.</p> : <div className="divide-y divide-[color:var(--border)]">{birthdays.map(({ employee }) => <Link key={employee.id} href="/admin/employees" className="flex items-center gap-3 py-3 transition-colors hover:text-primary"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-[11px] font-bold text-amber-700 dark:text-amber-300">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div><div className="min-w-0"><p className="truncate text-[13px] font-medium">{employee.firstName} {employee.lastName}</p><p className="truncate text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.position ?? employee.branch?.name ?? "Employee"}</p></div></Link>)}</div>}
            </CardContent>
          </Card>
    ),
    anniversaries: (
      <Card className="h-full">
            <CardHeader>
              <div><CardTitle>Today&apos;s anniversaries</CardTitle><CardDescription>{anniversaries.length} marriage {anniversaries.length === 1 ? "anniversary" : "anniversaries"} today</CardDescription></div>
              <CalendarCheck2 className="h-4.5 w-4.5 text-rose-500" />
            </CardHeader>
            <CardContent className="pt-1">
              {anniversaries.length === 0 ? <p className="py-3 text-center text-[13px] text-muted-foreground">No anniversaries today.</p> : <div className="divide-y divide-[color:var(--border)]">{anniversaries.map(({ employee }) => <Link key={employee.id} href="/admin/employees" className="flex items-center gap-3 py-3 transition-colors hover:text-primary"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-700 dark:text-rose-300">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div><div className="min-w-0"><p className="truncate text-[13px] font-medium">{employee.firstName} {employee.lastName}</p><p className="truncate text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.position ?? employee.branch?.name ?? "Employee"}</p></div></Link>)}</div>}
            </CardContent>
          </Card>
    ),
    new_joiners: (
      <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle>New joiners</CardTitle>
                <CardDescription>{currentMonthJoiners.length} this month · {previousMonthJoiners.length} last month</CardDescription>
              </div>
              <Users className="h-4.5 w-4.5 text-primary" />
            </CardHeader>
            <CardContent className="pt-1">
              {newJoiners.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted-foreground">No employees joined this or last month.</p>
              ) : (
                <div className="max-h-[23rem] divide-y divide-[color:var(--border)] overflow-y-auto pr-1">
                  {newJoiners.map((employee) => (
                    <Link key={employee.id} href={`/admin/employee-master?employee=${employee.id}`} className="flex items-center gap-3 py-3 transition-colors hover:text-primary">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.1] text-[11px] font-bold text-primary">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{employee.firstName} {employee.lastName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.position ?? employee.branch?.name ?? "New employee"}</p>
                      </div>
                      <time dateTime={employee.joiningDate?.toISOString()} className="shrink-0 font-mono text-[11px] text-muted-foreground">{employee.joiningDate ? dateLabel(employee.joiningDate) : "—"}</time>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
    ),
    departments: (
      <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle>By department</CardTitle>
                <CardDescription>Headcount distribution</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {departments.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">No departments yet.</p>
              ) : (
                <DepartmentBars
                  data={
                    departments.map((d) => ({
                      name: d.name,
                      count: employees.filter((e) => e.department?.name === d.name).length,
                    }))
                  }
                />
              )}
            </CardContent>
          </Card>
    ),
    gender_ratio: (
      <Card className="h-full">
            <CardHeader><div><CardTitle>Gender ratio</CardTitle><CardDescription>Active employee headcount</CardDescription></div></CardHeader>
            <CardContent><div className="space-y-4"><div className="h-3 overflow-hidden rounded-full bg-tint"><div className="h-full bg-sky-600" style={{ width: `${reportedGenderTotal ? (maleEmployees / reportedGenderTotal) * 100 : 0}%` }} /></div><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">Male</p><p className="mt-1 font-display text-2xl font-bold">{maleEmployees} <span className="text-sm font-medium text-muted-foreground">{reportedGenderTotal ? Math.round((maleEmployees / reportedGenderTotal) * 100) : 0}%</span></p></div><div><p className="text-muted-foreground">Female</p><p className="mt-1 font-display text-2xl font-bold">{femaleEmployees} <span className="text-sm font-medium text-muted-foreground">{reportedGenderTotal ? Math.round((femaleEmployees / reportedGenderTotal) * 100) : 0}%</span></p></div></div></div></CardContent>
          </Card>
    ),
    pending_leave_requests: (
      <Card className="h-full">
        <CardHeader>
          <div>
          <CardTitle>Leave requests waiting for review</CardTitle>
          <CardDescription>{pendingLeaveCount} request{pendingLeaveCount === 1 ? "" : "s"} currently need your approval</CardDescription>
          </div>
          <Link href={leaveReviewHref} className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-tint">Review leave requests</Link>
        </CardHeader>
        <CardContent className="pt-4">
          {pendingLeaves.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">All caught up — nothing pending.</p>
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {pendingLeaves.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.leaveType.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {l.employee.firstName} {l.employee.lastName}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {l.leaveType.name} · {dateLabel(l.fromDate)} → {dateLabel(l.toDate)} · {l.days}d
                    </p>
                  </div>
                  {l.cancellationRequestedBy ? <span className="rounded-md bg-tint px-2 py-1 text-xs text-muted-foreground">Cancellation requested</span> : <StatusPill status="pending" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    ),
    on_leave: <StatCard label="On leave" value={counts.onLeave} icon={<CalendarClock className="h-4.5 w-4.5" />} tone="sky" className={statCardClass} />,
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-edge bg-card p-5 sm:p-6">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.035em]">HR dashboard</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            {todayLabel} · {region.timeZone}
            {branchFilter ? ` · ${branchFilter.name}` : " · All branches in your scope"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{isBranchManager ? (
          <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
            Branch: {ownBranchName}
          </span>
        ) : (
          <form key={branchId ?? "all"} action="/admin" aria-label="Dashboard branch" className="flex min-w-0 flex-wrap items-center gap-2">
            <Select name="branch" aria-label="Filter by branch" defaultValue={branchId ?? ""} className="min-w-40 max-w-full">
              <option value="">All branches</option>
              {branches.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </Select>
            <Button type="submit" size="sm" variant="outline">Apply branch</Button>
          </form>
        )}{session.role === "admin" && <Link href={layoutEditorHref} className="rounded-lg border border-edge px-3 py-2 text-xs font-medium hover:bg-tint">Customize dashboard</Link>}{canReview && <Link href="/admin/approvals" className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:brightness-110">All approval queues</Link>}</div>
      </div>

      {session.role === "admin" && !branchId && canSeePeople && employees.every((employee) => employee.id === session.sub) && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Set up your workspace</CardTitle>
              <CardDescription>Add your team and review the policies employees will use.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Link href="/admin/employee-master" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Add employees</Link>
            <Link href="/admin/configuration/company-settings" className="rounded-lg border border-edge px-3 py-2 text-sm font-medium hover:bg-tint">Review company settings</Link>
          </CardContent>
        </Card>
      )}

      {workflowLinks.length > 0 && (
        <section aria-labelledby="operations-heading" className="space-y-3">
          <h2 id="operations-heading" className="font-display text-lg font-semibold">HR operations</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workflowLinks.map(({ title, icon: Icon, summary, primary, secondary, setup }) => (
            <Card key={title} className="min-w-0">
              <CardHeader className="gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span>
                  <div><CardTitle>{title}</CardTitle><CardDescription>{summary}</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3">
                <Link href={primary.href} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  {primary.label}<ArrowUpRight aria-hidden="true" className="size-3.5" />
                </Link>
                <Link href={secondary.href} className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">{secondary.label}</Link>
                {setup && <Link href={setup.href} className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">{setup.label}</Link>}
              </CardContent>
            </Card>
          ))}
          </div>
        </section>
      )}

      {visibleWidgets.length ? (
        <div aria-label="Dashboard widgets" className="grid grid-cols-2 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {visibleWidgets.map(({ key, size }) => (
            <div key={key} className={dashboardWidgetColumns(key, size)}>
              {widgetContents[key]}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No dashboard widgets available" description={session.role === "admin" ? "Review your dashboard layout or workspace modules." : "Ask your administrator about your dashboard layout."} />
      )}
    </div>
  );
}
