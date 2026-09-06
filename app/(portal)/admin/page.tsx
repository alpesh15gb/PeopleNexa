import { Suspense } from "react";
import { CalendarClock, Users, UserCheck, Clock4, ShieldAlert, CalendarCheck2, TimerOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { startOfDay, addDays, toDateKey, formatTime, formatDate, relativeDay } from "@/lib/dates";
import { StatCard } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { WeekChart } from "./week-chart";
import { DepartmentBars } from "./department-bars";
import { BranchPicker } from "./attendance/branch-picker";

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
      className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6"
    >
      {Array.from({ length: 6 }).map((_, i) => (
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
  searchParams: Promise<{ branch?: string }>;
}) {
  const session = await requireSession();
  const { branch: branchParam } = await searchParams;
  const today = startOfDay(new Date());

  // Branch filter must belong to this tenant; unknown ids are ignored.
  const branchFilter = branchParam
    ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId }, select: { id: true, name: true } })
    : null;
  const branchId = branchFilter?.id ?? null;
  const empScope = { tenantId: session.tenantId, status: "active", ...(branchId ? { branchId } : {}) };

  const [employees, attendance, departments, pendingLeaves, pendingLeaveCount, branches] = await Promise.all([
    prisma.employee.findMany({
      where: empScope,
      select: { id: true, department: { select: { name: true } } },
    }),
    prisma.attendance.findMany({
      where: branchId
        ? { tenantId: session.tenantId, date: { gte: today, lt: addDays(today, 1) }, employee: { branchId } }
        : { tenantId: session.tenantId, date: { gte: today, lt: addDays(today, 1) } },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } },
      },
      orderBy: { punchInTime: "asc" },
    }),
    prisma.department.findMany({
      where: { tenantId: session.tenantId },
      include: { _count: { select: { employees: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: branchId
        ? { tenantId: session.tenantId, status: "pending", employee: { branchId } }
        : { tenantId: session.tenantId, status: "pending" },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 6,
    }),
    prisma.leaveRequest.count({
      where: branchId
        ? { tenantId: session.tenantId, status: "pending", employee: { branchId } }
        : { tenantId: session.tenantId, status: "pending" },
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Branch-scoped week trend (groupBy can't join employee, so aggregate raw
  // rows in code when filtered; global path keeps the cheap groupBy).
  type WeekRow = { date: Date; status: string; _count?: number };
  let weekRows: WeekRow[];
  if (branchId) {
    const rows = await prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today }, employee: { branchId } },
      select: { date: true, status: true },
    });
    weekRows = rows.map((r) => ({ date: r.date, status: r.status }));
  } else {
    const grouped = await prisma.attendance.groupBy({
      by: ["date", "status"],
      where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today } },
      _count: true,
    });
    weekRows = grouped.map((r) => ({ date: r.date, status: r.status, _count: r._count }));
  }

  const counts = { present: 0, late: 0, permission: 0, half_day: 0, absent: 0 };
  for (const a of attendance) {
    if (counts[a.status as keyof typeof counts] !== undefined) counts[a.status as keyof typeof counts]!++;
  }
  const marked = attendance.length;
  counts.absent += Math.max(employees.length - marked, 0);

  const week = [];
  // Normalize both shapes (groupBy _count vs raw rows) to per-day tallies.
  const tally = new Map<string, { present: number; late: number; absent: number }>();
  for (const r of weekRows as Array<{ date: Date; status: string; _count?: number }>) {
    const key = toDateKey(r.date);
    const cur = tally.get(key) ?? { present: 0, late: 0, absent: 0 };
    const n = r._count ?? 1;
    if (r.status === "present" || r.status === "late" || r.status === "half_day") cur.present += n;
    if (r.status === "late") cur.late += n;
    if (r.status === "absent") cur.absent += n;
    tally.set(key, cur);
  }
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const t = tally.get(toDateKey(day)) ?? { present: 0, late: 0, absent: 0 };
    week.push({ day: toDateKey(day), label: toDateKey(day).slice(5), ...t });
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
        <BranchPicker branches={branches} value={branchId ?? ""} basePath="/admin" />
      </div>

      {/* Stats */}
      <Suspense fallback={<StatsSkeleton />}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total employees" value={employees.length} icon={<Users className="h-4.5 w-4.5" />} tone="indigo" className={statCardClass} />
        <StatCard label="Present" value={counts.present} icon={<UserCheck className="h-4.5 w-4.5" />} tone="emerald" className={statCardClass} />
        <StatCard label="Late" value={counts.late} icon={<Clock4 className="h-4.5 w-4.5" />} tone="amber" className={statCardClass} />
        <StatCard label="Permission" value={counts.permission} icon={<ShieldAlert className="h-4.5 w-4.5" />} tone="sky" className={statCardClass} />
        <StatCard label="Absent" value={counts.absent} icon={<TimerOff className="h-4.5 w-4.5" />} tone="rose" className={statCardClass} />
        <StatCard
          label="Pending leaves"
          value={pendingLeaveCount}
          icon={<CalendarCheck2 className="h-4.5 w-4.5" />}
          tone="violet"
          className={statCardClass}
        />
      </div>
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's live list */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Today&apos;s attendance</CardTitle>
              <CardDescription>{marked} of {employees.length} employees marked · {toDateKey(today)}</CardDescription>
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
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Week chart */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Last 7 days</CardTitle>
                <CardDescription>Attendance trend</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <WeekChart data={week} />
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
                    branchId
                      ? departments.map((d) => ({
                          name: d.name,
                          count: employees.filter((e) => e.department?.name === d.name).length,
                        }))
                      : departments.map((d) => ({ name: d.name, count: d._count.employees }))
                  }
                />
              )}
            </CardContent>
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
