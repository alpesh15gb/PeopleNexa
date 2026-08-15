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

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireSession();
  const today = startOfDay(new Date());

  const [employees, attendance, departments, pendingLeaves, weekRecords] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId: session.tenantId, status: "active" } }),
    prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: today, lt: addDays(today, 1) } },
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
      where: { tenantId: session.tenantId, status: "pending" },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 6,
    }),
    prisma.attendance.groupBy({
      by: ["date", "status"],
      where: { tenantId: session.tenantId, date: { gte: addDays(today, -6), lte: today } },
      _count: true,
    }),
  ]);

  const counts = { present: 0, late: 0, permission: 0, half_day: 0, absent: 0 };
  for (const a of attendance) {
    if (counts[a.status as keyof typeof counts] !== undefined) counts[a.status as keyof typeof counts]!++;
  }
  const marked = attendance.length;
  counts.absent = Math.max(employees.length - marked, 0);

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const recs = weekRecords.filter((r) => toDateKey(r.date) === toDateKey(day));
    week.push({
      day: toDateKey(day),
      label: toDateKey(day).slice(5),
      present: recs.filter((r) => r.status === "present" || r.status === "late" || r.status === "half_day").reduce((s, r) => s + r._count, 0),
      late: recs.filter((r) => r.status === "late").reduce((s, r) => s + r._count, 0),
      absent: recs.filter((r) => r.status === "absent").reduce((s, r) => s + r._count, 0),
    });
  }

  return (
    <div className="animate-fade-up space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Good day, Admin 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's what's happening at your company on {formatDate(today)} ({relativeDay(today)}).
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total employees" value={employees.length} icon={<Users className="h-4.5 w-4.5" />} tone="indigo" />
        <StatCard label="Present" value={counts.present} icon={<UserCheck className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="Late" value={counts.late} icon={<Clock4 className="h-4.5 w-4.5" />} tone="amber" />
        <StatCard label="Permission" value={counts.permission} icon={<ShieldAlert className="h-4.5 w-4.5" />} tone="sky" />
        <StatCard label="Absent" value={counts.absent} icon={<TimerOff className="h-4.5 w-4.5" />} tone="rose" />
        <StatCard
          label="Pending leaves"
          value={pendingLeaves.length}
          icon={<CalendarCheck2 className="h-4.5 w-4.5" />}
          tone="violet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's live list */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Today's attendance</CardTitle>
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
              <div className="divide-y divide-white/[0.04]">
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
                <DepartmentBars data={departments.map((d) => ({ name: d.name, count: d._count.employees }))} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pending leaves */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pending leave requests</CardTitle>
            <CardDescription>Waiting for your approval</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {pendingLeaves.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">All caught up — nothing pending.</p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
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
