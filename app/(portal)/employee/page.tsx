import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { startOfDay, addDays, toDateKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { ClockCard } from "./clock-card";
import { StatCard } from "@/components/ui/stat";
import { CalendarCheck2, TimerOff, Clock4, CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Token-driven stat sizing: tabular numerals, truncated values, responsive sizes.
// Applied via className passthrough since StatCard internals live in components/*.
const statCardClass =
  "min-w-0 tabular-nums [&_.font-display]:truncate [&_.font-display]:text-[24px] sm:[&_.font-display]:text-[28px] xl:[&_.font-display]:text-[30px]";

// Inline loading shimmer (no Skeleton export in components/ui/stat).
// Used as a Suspense fallback so the stack keeps layout while streaming.
function StatsSkeleton() {
  return (
    <div role="status" aria-label="Loading statistics" className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-edge bg-card p-4 motion-safe:animate-pulse sm:p-5">
          <div className="h-3 w-2/3 rounded-md bg-muted" />
          <div className="mt-3 h-8 w-1/2 rounded-md bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading statistics…</span>
    </div>
  );
}

export default async function EmployeeDashboardPage() {
  const session = await requireSession();
  const lang = await getLang();
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    include: { shift: true, branch: true, department: true },
  });
  if (!employee) return null;

  const [todayRecord, monthRecords, monthLeaves, pending] = await Promise.all([
    prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: { gte: today, lt: addDays(today, 1) } },
    }),
    prisma.attendance.findMany({
      where: { employeeId: employee.id, date: { gte: monthStart, lt: addDays(today, 1) } },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, status: "approved", toDate: { gte: today } },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: employee.id, status: "pending" },
      include: { leaveType: true },
      orderBy: { appliedAt: "desc" },
      take: 3,
    }),
  ]);

  const present = monthRecords.filter((r) => r.status === "present" || r.status === "half_day").length;
  const late = monthRecords.filter((r) => r.status === "late").length;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">Your workday</p>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.035em]">
          {t(lang, "dashboard.welcome", { name: employee.firstName })}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          {employee.department?.name ?? t(lang, "common.general")} · {employee.shift?.name ?? t(lang, "common.noShift")} · {toDateKey(today)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Clock card */}
        <div className="lg:col-span-2">
          <ClockCard
            record={todayRecord}
            shift={employee.shift}
            branch={employee.branch}
            employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
            lang={lang}
          />
        </div>

        {/* Month stats */}
        <Suspense fallback={<StatsSkeleton />}>
        <div className="space-y-4">
          <StatCard label={t(lang, "dashboard.thisMonth")} value={t(lang, "dashboard.days", { n: present + late })} icon={<CalendarDays className="h-4.5 w-4.5" />} tone="indigo" sub={`${toDateKey(today).slice(0, 7)}`} className={statCardClass} />
          <StatCard label={t(lang, "common.present")} value={present} icon={<CalendarCheck2 className="h-4.5 w-4.5" />} tone="emerald" className={statCardClass} />
          <StatCard label={t(lang, "common.late")} value={late} icon={<Clock4 className="h-4.5 w-4.5" />} tone="amber" className={statCardClass} />
          <StatCard label={t(lang, "common.onLeave")} value={monthLeaves.reduce((s, l) => s + l.days, 0)} icon={<TimerOff className="h-4.5 w-4.5" />} tone="violet" className={statCardClass} />
        </div>
        </Suspense>
      </div>

      {/* Pending requests */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t(lang, "dashboard.recentLeaves")}</CardTitle>
            <CardDescription>{t(lang, "dashboard.latestActivity")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {pending.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">{t(lang, "common.noLeaveRequests")}</p>
          ) : (
            <div className="divide-y divide-[color:var(--border)]">
              {pending.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.leaveType.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{l.leaveType.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {toDateKey(l.fromDate)} → {toDateKey(l.toDate)} · {l.days}d
                    </p>
                  </div>
                  <StatusPill status={l.status} lang={lang} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
