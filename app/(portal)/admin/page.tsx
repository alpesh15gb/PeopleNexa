import { Suspense } from "react";
import Link from "next/link";
import { CalendarClock, Users, UserCheck, Clock4, ShieldAlert, CalendarCheck2, TimerOff, IdCard, ChevronLeft, ChevronRight, PartyPopper, Fingerprint, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { addDays, formatTime, formatDate, formatDateIST, relativeDay } from "@/lib/dates";
import { istStartOfDay, istDateKey } from "@/lib/ist";
import { StatCard } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { WeekChart } from "./week-chart";
import { DepartmentBars } from "./department-bars";
import { BranchPicker } from "./attendance/branch-picker";
import { tallyDailyAttendance, type AttendanceTally } from "@/lib/attendance-tally";

export const dynamic = "force-dynamic";

// Token-driven stat sizing: tabular numerals, truncated values, responsive sizes.
// Applied via className passthrough since StatCard internals live in components/*.
const statCardClass =
  "min-w-0 tabular-nums [&_.font-display]:truncate [&_.font-display]:text-[24px] sm:[&_.font-display]:text-[28px] xl:[&_.font-display]:text-[30px]";

// Inline loading shimmer (no Skeleton export in components/ui/stat).
// Used as a Suspense fallback so the grid keeps layout while streaming.
function StatsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading statistics"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-edge bg-card p-4 motion-safe:animate-pulse sm:p-5">
          <div className="h-3 w-2/3 rounded-md bg-muted" />
          <div className="mt-3 h-8 w-1/2 rounded-md bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading statistics…</span>
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; attendancePage?: string }>;
}) {
  const session = await requireSession();
  const { branch: branchParam, attendancePage: attendancePageParam } = await searchParams;
  const today = istStartOfDay(new Date());

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownLocationId = isLocationManager ? (await prisma.employee.findUnique({ where: { id: session.sub }, select: { locationId: true } }))?.locationId ?? null : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";

  // Branch filter must belong to this tenant; unknown ids are ignored.
  const branchFilter = isBranchManager
    ? (ownBranchId ? { id: ownBranchId, name: ownBranchName } : null)
      : branchParam
       ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true, name: true } })
      : null;
  const branchId = isBranchManager ? ownBranchId : (branchFilter?.id ?? null);
  const locationEmployeeScope = ownLocationId ? { branch: { locationId: ownLocationId } } : {};
  const empScope = { tenantId: session.tenantId, status: "active", loginOnly: false, ...locationEmployeeScope, ...(branchId ? { branchId } : {}) };
  const currentMonth = istDateKey(today).slice(0, 7);
  const attendancePageSize = 25;
  const attendancePage = Math.max(1, Number.parseInt(attendancePageParam ?? "1", 10) || 1);
  const [year, month] = currentMonth.split("-").map(Number);
  const currentMonthStart = istStartOfDay(new Date(Date.UTC(year, month - 1, 1, 12)));
  const previousMonthStart = istStartOfDay(new Date(Date.UTC(year, month - 2, 1, 12)));
  const nextMonthStart = istStartOfDay(new Date(Date.UTC(year, month, 1, 12)));
  const licenseExpiryStart = new Date(Date.UTC(year, month - 1, 1));
  const licenseExpiryEnd = new Date(Date.UTC(year, month, 1));

  const attendanceWhere = branchId
    ? { tenantId: session.tenantId, date: { gte: today, lt: addDays(today, 1) }, employee: { branchId, status: "active", loginOnly: false } }
    : { tenantId: session.tenantId, date: { gte: today, lt: addDays(today, 1) }, employee: ownLocationId ? { status: "active", loginOnly: false, branch: { locationId: ownLocationId } } : { status: "active", loginOnly: false } };
  const [employees, attendance, attendanceTotal, attendanceRecords, approvedLeaves, departments, pendingLeaves, pendingLeaveCount, branches, expiringLicenses, newJoiners, celebrationProfiles] = await Promise.all([
    prisma.employee.findMany({
      where: empScope,
      select: { id: true, department: { select: { name: true } }, branch: { select: { name: true } }, profile: { select: { gender: true } } },
    }),
    prisma.attendance.findMany({
      where: attendanceWhere,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } },
      },
      orderBy: { punchInTime: "asc" },
      skip: (attendancePage - 1) * attendancePageSize,
      take: attendancePageSize,
    }),
    prisma.attendance.count({ where: attendanceWhere }),
    prisma.attendance.findMany({ where: attendanceWhere, select: { employeeId: true, status: true } }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, status: "approved", fromDate: { lt: addDays(today, 1) }, toDate: { gte: today }, employee: empScope },
      select: { employeeId: true },
    }),
    prisma.department.findMany({
      where: {
        tenantId: session.tenantId,
        ...((branchId || ownLocationId) ? { employees: { some: branchId ? { branchId } : { branch: { locationId: ownLocationId! } } } } : {}),
      },
    }),
    prisma.leaveRequest.findMany({
      where: branchId
        ? { tenantId: session.tenantId, status: "pending", employee: { branchId } }
        : { tenantId: session.tenantId, status: "pending", ...(ownLocationId ? { employee: { branch: { locationId: ownLocationId } } } : {}) },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 6,
    }),
    prisma.leaveRequest.count({
      where: branchId
        ? { tenantId: session.tenantId, status: "pending", employee: { branchId } }
        : { tenantId: session.tenantId, status: "pending", ...(ownLocationId ? { employee: { branch: { locationId: ownLocationId } } } : {}) },
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({
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
    }),
    prisma.employee.findMany({
      where: { ...empScope, joiningDate: { gte: previousMonthStart, lt: nextMonthStart } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true, position: true, branch: { select: { name: true } } },
      orderBy: { joiningDate: "desc" },
    }),
    prisma.employeeProfile.findMany({
      where: { employee: empScope, OR: [{ dateOfBirthCertificate: { not: null } }, { actualDateOfBirth: { not: null } }, { marriageDate: { not: null } }] },
      select: { dateOfBirthCertificate: true, actualDateOfBirth: true, marriageDate: true, employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true, branch: { select: { name: true } } } } },
    }),
  ]);

  // Branch-scoped week trend (groupBy can't join employee, so aggregate raw
  // rows in code when filtered; global path keeps the cheap groupBy).
  type WeekRow = { date: Date; status: string; _count?: number };
  let weekRows: WeekRow[];
  if (branchId || ownLocationId) {
    const rows = await prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: currentMonthStart, lt: addDays(today, 1) }, employee: branchId ? { branchId, status: "active", loginOnly: false } : { status: "active", loginOnly: false, branch: { locationId: ownLocationId! } } },
      select: { date: true, status: true },
    });
    weekRows = rows.map((r) => ({ date: r.date, status: r.status }));
  } else {
    const grouped = await prisma.attendance.groupBy({
      by: ["date", "status"],
      where: { tenantId: session.tenantId, date: { gte: currentMonthStart, lt: addDays(today, 1) }, employee: { status: "active", loginOnly: false } },
      _count: true,
    });
    weekRows = grouped.map((r) => ({ date: r.date, status: r.status, _count: r._count }));
  }

  const counts = tallyDailyAttendance(employees.map((employee) => employee.id), attendanceRecords, approvedLeaves.map((leave) => leave.employeeId));
  const maleEmployees = employees.filter((employee) => employee.profile?.gender?.toLowerCase() === "male").length;
  const femaleEmployees = employees.filter((employee) => employee.profile?.gender?.toLowerCase() === "female").length;
  const reportedGenderTotal = maleEmployees + femaleEmployees;
  const marked = counts.marked;
  const attendancePageCount = Math.max(1, Math.ceil(attendanceTotal / attendancePageSize));
  const attendanceHref = (page: number) => {
    const params = new URLSearchParams();
    if (branchId) params.set("branch", branchId);
    params.set("attendancePage", String(page));
    return `/admin?${params.toString()}`;
  };
  const currentMonthJoiners = newJoiners.filter((employee) => employee.joiningDate && employee.joiningDate >= currentMonthStart);
  const previousMonthJoiners = newJoiners.filter((employee) => employee.joiningDate && employee.joiningDate < currentMonthStart);
  const todayMonthDay = istDateKey(today).slice(5);
  const birthdays = celebrationProfiles.filter((profile) => {
    const birthday = profile.actualDateOfBirth ?? profile.dateOfBirthCertificate;
    return birthday && istDateKey(birthday).slice(5) === todayMonthDay;
  });
  const anniversaries = celebrationProfiles.filter((profile) => profile.marriageDate && istDateKey(profile.marriageDate).slice(5) === todayMonthDay);
  const [devicePunches, projectAttendance] = await Promise.all([
    prisma.punch.findMany({ where: { tenantId: session.tenantId, punchTime: { gte: today, lt: addDays(today, 1) }, employee: branchId ? { branchId, status: "active", loginOnly: false } : ownLocationId ? { status: "active", loginOnly: false, branch: { locationId: ownLocationId } } : { status: "active", loginOnly: false } }, select: { employeeId: true, device: { select: { name: true } }, realtimeDevice: { select: { name: true } } } }),
    prisma.attendance.findMany({ where: attendanceWhere, select: { employeeId: true, status: true, employee: { select: { branch: { select: { name: true } } } } } }),
  ]);
  const deviceEmployees = new Map<string, Set<string>>();
  for (const punch of devicePunches) { const name = punch.device?.name ?? punch.realtimeDevice?.name ?? "Unidentified device"; const employees = deviceEmployees.get(name) ?? new Set<string>(); employees.add(punch.employeeId); deviceEmployees.set(name, employees); }
  const deviceAttendance = new Map([...deviceEmployees].map(([name, employees]) => [name, employees.size]));
  const projectEmployeeIds = new Map<string, string[]>();
  const projectRecords = new Map<string, Array<{ employeeId: string; status: string }>>();
  const projectLeaveIds = new Map<string, string[]>();
  const employeeProject = new Map(employees.map((employee) => [employee.id, employee.branch?.name ?? "Unassigned"]));
  for (const employee of employees) {
    const name = employeeProject.get(employee.id)!;
    projectEmployeeIds.set(name, [...(projectEmployeeIds.get(name) ?? []), employee.id]);
  }
  for (const row of projectAttendance) {
    const name = employeeProject.get(row.employeeId);
    if (name) projectRecords.set(name, [...(projectRecords.get(name) ?? []), row]);
  }
  for (const leave of approvedLeaves) {
    const name = employeeProject.get(leave.employeeId);
    if (name) projectLeaveIds.set(name, [...(projectLeaveIds.get(name) ?? []), leave.employeeId]);
  }
  const projectAttendanceCounts = new Map<string, AttendanceTally>();
  for (const [name, employeeIds] of projectEmployeeIds) {
    projectAttendanceCounts.set(name, tallyDailyAttendance(employeeIds, projectRecords.get(name) ?? [], projectLeaveIds.get(name) ?? []));
  }

  const week = [];
  // Normalize both shapes (groupBy _count vs raw rows) to per-day tallies.
  const tally = new Map<string, { present: number; late: number; absent: number }>();
  for (const r of weekRows as Array<{ date: Date; status: string; _count?: number }>) {
    const key = istDateKey(r.date);
    const cur = tally.get(key) ?? { present: 0, late: 0, absent: 0 };
    const n = r._count ?? 1;
    if (r.status === "present" || r.status === "late" || r.status === "half_day") cur.present += n;
    if (r.status === "late") cur.late += n;
    if (r.status === "absent") cur.absent += n;
    tally.set(key, cur);
  }
  const monthDayCount = Math.round((today.getTime() - currentMonthStart.getTime()) / 86_400_000);
  for (let i = monthDayCount; i >= 0; i--) {
    const day = addDays(today, -i);
    const t = tally.get(istDateKey(day)) ?? { present: 0, late: 0, absent: 0 };
    const dayKey = istDateKey(day);
    week.push({ day: dayKey, label: `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`, ...t });
  }

  return (
    <div className="animate-fade-up space-y-6">
      {/* Greeting */}
          <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">Today at a glance</p>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.035em]">Good day, Admin</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Here&apos;s what needs your attention on {formatDate(today)} ({relativeDay(today)})
            {branchFilter ? ` · ${branchFilter.name}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">{isBranchManager ? (
          <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
            Branch: {ownBranchName}
          </span>
        ) : (
          <BranchPicker branches={branches} value={branchId ?? ""} basePath="/admin" />
        )}<Link href="/admin/reports/punch-details" className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white">Punch Details</Link></div>
      </div>

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
       <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total employees" value={counts.total} icon={<Users className="h-4.5 w-4.5" />} tone="indigo" className={statCardClass} />
        <StatCard label="Present" value={counts.present} icon={<UserCheck className="h-4.5 w-4.5" />} tone="emerald" className={statCardClass} />
        <StatCard label="Late" value={counts.late} icon={<Clock4 className="h-4.5 w-4.5" />} tone="amber" className={statCardClass} />
        <StatCard label="Permission" value={counts.permission} icon={<ShieldAlert className="h-4.5 w-4.5" />} tone="sky" className={statCardClass} />
        <StatCard label="Absent" value={counts.absent + counts.noRecord} icon={<TimerOff className="h-4.5 w-4.5" />} tone="rose" className={statCardClass} />
        <StatCard
          label="Pending leaves"
          value={pendingLeaveCount}
          icon={<CalendarCheck2 className="h-4.5 w-4.5" />}
          tone="violet"
          className={statCardClass}
        />
       </div>
       </Suspense>

       <Card>
         <CardHeader>
           <div>
             <CardTitle>This month</CardTitle>
             <CardDescription>Daily attendance trend through {formatDate(today)}</CardDescription>
           </div>
         </CardHeader>
         <CardContent className="pt-0">
           <WeekChart data={week} />
         </CardContent>
       </Card>

       <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><div><CardTitle>Biometric device attendance</CardTitle><CardDescription>Distinct active employees who punched today</CardDescription></div><Fingerprint className="h-4.5 w-4.5 text-primary" /></CardHeader><CardContent>{deviceAttendance.size ? <div className="divide-y divide-edge">{[...deviceAttendance.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => <div key={name} className="flex items-center justify-between py-2.5 text-sm"><span>{name}</span><strong className="font-mono">{count} employees</strong></div>)}</div> : <p className="py-4 text-center text-sm text-muted-foreground">No biometric attendance today.</p>}</CardContent></Card>
        <Card><CardHeader><div><CardTitle>Project-wise attendance</CardTitle><CardDescription>Today&apos;s attendance by branch/project</CardDescription></div><Building2 className="h-4.5 w-4.5 text-primary" /></CardHeader><CardContent>{projectAttendanceCounts.size ? <div className="divide-y divide-edge">{[...projectAttendanceCounts.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, count]) => <div key={name} className="flex items-center justify-between py-2.5 text-sm"><span>{name}</span><strong className="font-mono">{count.present + count.late + count.halfDay}/{count.total} present · {count.absent + count.noRecord} absent</strong></div>)}</div> : <p className="py-4 text-center text-sm text-muted-foreground">No active employees assigned to a project.</p>}</CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's live list */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Today&apos;s attendance</CardTitle>
              <CardDescription>{marked} attendance records · {counts.onLeave} on leave · {counts.noRecord} no record · {formatDate(today)}</CardDescription>
            </div>
            <CalendarClock className="h-4.5 w-4.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-4">
            {attendance.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="No one has clocked in yet"
                description="Punches will appear here in real time as employees check in."
              />
            ) : (
              <>
                <div className="divide-y divide-[color:var(--border)]">
                {attendance.map((a) => (
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
                        {formatTime(a.punchInTime)}
                        {a.punchOutTime && <span className="text-muted-foreground"> → {formatTime(a.punchOutTime)}</span>}
                      </p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                ))}
                </div>
                {attendancePageCount > 1 && (
                <nav aria-label="Today&apos;s attendance pages" className="mt-4 flex items-center justify-between border-t border-edge pt-3">
                  {attendancePage > 1 ? (
                    <Link href={attendanceHref(attendancePage - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                    </Link>
                  ) : <span className="inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground/50">Previous</span>}
                  <span className="text-xs font-medium text-muted-foreground" aria-current="page">Page {Math.min(attendancePage, attendancePageCount)} of {attendancePageCount}</span>
                  {attendancePage < attendancePageCount ? (
                    <Link href={attendanceHref(attendancePage + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                      Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : <span className="inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground/50">Next</span>}
                </nav>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
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
                        {formatDate(employee.drivingLicenseExpiresAt!)}
                      </time>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div><CardTitle>Today&apos;s birthdays</CardTitle><CardDescription>{birthdays.length} celebration{birthdays.length === 1 ? "" : "s"} today</CardDescription></div>
              <PartyPopper className="h-4.5 w-4.5 text-amber-500" />
            </CardHeader>
            <CardContent className="pt-1">
              {birthdays.length === 0 ? <p className="py-3 text-center text-[13px] text-muted-foreground">No birthdays today.</p> : <div className="divide-y divide-[color:var(--border)]">{birthdays.map(({ employee }) => <Link key={employee.id} href="/admin/employees" className="flex items-center gap-3 py-3 transition-colors hover:text-primary"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-[11px] font-bold text-amber-700 dark:text-amber-300">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div><div className="min-w-0"><p className="truncate text-[13px] font-medium">{employee.firstName} {employee.lastName}</p><p className="truncate text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.position ?? employee.branch?.name ?? "Employee"}</p></div></Link>)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div><CardTitle>Today&apos;s anniversaries</CardTitle><CardDescription>{anniversaries.length} marriage {anniversaries.length === 1 ? "anniversary" : "anniversaries"} today</CardDescription></div>
              <CalendarCheck2 className="h-4.5 w-4.5 text-rose-500" />
            </CardHeader>
            <CardContent className="pt-1">
              {anniversaries.length === 0 ? <p className="py-3 text-center text-[13px] text-muted-foreground">No anniversaries today.</p> : <div className="divide-y divide-[color:var(--border)]">{anniversaries.map(({ employee }) => <Link key={employee.id} href="/admin/employees" className="flex items-center gap-3 py-3 transition-colors hover:text-primary"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-700 dark:text-rose-300">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div><div className="min-w-0"><p className="truncate text-[13px] font-medium">{employee.firstName} {employee.lastName}</p><p className="truncate text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.position ?? employee.branch?.name ?? "Employee"}</p></div></Link>)}</div>}
            </CardContent>
          </Card>

          <Card>
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
                      <time dateTime={employee.joiningDate?.toISOString()} className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDateIST(employee.joiningDate)}</time>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Departments */}
          <Card>
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
          <Card>
            <CardHeader><div><CardTitle>Gender ratio</CardTitle><CardDescription>Active employee headcount</CardDescription></div></CardHeader>
            <CardContent><div className="space-y-4"><div className="h-3 overflow-hidden rounded-full bg-tint"><div className="h-full bg-sky-600" style={{ width: `${reportedGenderTotal ? (maleEmployees / reportedGenderTotal) * 100 : 0}%` }} /></div><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">Male</p><p className="mt-1 font-display text-2xl font-bold">{maleEmployees} <span className="text-sm font-medium text-muted-foreground">{reportedGenderTotal ? Math.round((maleEmployees / reportedGenderTotal) * 100) : 0}%</span></p></div><div><p className="text-muted-foreground">Female</p><p className="mt-1 font-display text-2xl font-bold">{femaleEmployees} <span className="text-sm font-medium text-muted-foreground">{reportedGenderTotal ? Math.round((femaleEmployees / reportedGenderTotal) * 100) : 0}%</span></p></div></div></div></CardContent>
          </Card>
        </div>
      </div>

      {/* Pending leaves */}
      <Card>
        <CardHeader>
          <div>
          <CardTitle>Leave requests waiting for review</CardTitle>
          <CardDescription>{pendingLeaveCount} request{pendingLeaveCount === 1 ? "" : "s"} currently need your approval</CardDescription>
          </div>
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
                      {l.leaveType.name} · {formatDate(l.fromDate)} → {formatDate(l.toDate)} · {l.days}d
                    </p>
                  </div>
                  <StatusPill status="pending" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
