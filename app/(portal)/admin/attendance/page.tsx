import { PartyPopper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { fromDateKey, startOfDay, endOfDay, todayKey, formatTime, formatDate } from "@/lib/dates";
import { finalizeEligibleDays } from "@/lib/reconcile";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceTable } from "./attendance-table";
import { DatePicker } from "./date-picker";
import { EmptyState } from "@/components/ui/stat";

export const dynamic = "force-dynamic";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const { date: dateParam } = await searchParams;
  const dateKey = dateParam || todayKey();
  const dayStart = startOfDay(fromDateKey(dateKey));

  // Lazy finalization of past days (Phase 4 reconciliation).
  await finalizeEligibleDays(session.tenantId);

  const [employees, records, leaves, holidays] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        shift: { select: { name: true, startTime: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: { tenantId: session.tenantId, date: { gte: dayStart, lte: endOfDay(dayStart) } },
      include: { branch: { select: { name: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lte: endOfDay(dayStart) },
        toDate: { gte: dayStart },
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId, date: { gte: dayStart, lte: endOfDay(dayStart) } } }),
  ]);

  const leaveByEmp = new Map(leaves.map((l) => [l.employee.id, l]));
  const recordByEmp = new Map(records.map((r) => [r.employeeId, r]));

  const rows = employees.map((emp) => {
    const record = recordByEmp.get(emp.id);
    const leave = leaveByEmp.get(emp.id);
    return {
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      department: emp.department?.name ?? "Unassigned",
      shift: emp.shift?.name ?? "—",
      record: record
        ? {
            id: record.id,
            punchIn: formatTime(record.punchInTime),
            punchOut: formatTime(record.punchOutTime),
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

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.leave ? "on_leave" : r.record ? r.record.status : "absent";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const statCards = [
    { label: "Present", value: counts.present ?? 0, cls: "text-emerald-300" },
    { label: "Late", value: counts.late ?? 0, cls: "text-amber-300" },
    { label: "Permission", value: counts.permission ?? 0, cls: "text-sky-300" },
    { label: "On leave", value: counts.on_leave ?? 0, cls: "text-violet-300" },
    { label: "Absent", value: counts.absent ?? 0, cls: "text-rose-300" },
  ];

  const isHoliday = holidays.length > 0;

  return (
    <div className="animate-fade-up space-y-6">
      {isHoliday && (
        <div className="flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-5 py-4">
          <PartyPopper className="h-5 w-5 shrink-0 text-violet-300" />
          <div>
            <p className="font-display text-sm font-semibold text-violet-200">
              {holidays.map((h) => h.name).join(", ")}
            </p>
            <p className="text-[12.5px] text-violet-300/80">
              Company holiday — no attendance is expected on this date.
            </p>
          </div>
        </div>
      )}
      <PageHeader
        title="Attendance"
        description={`Daily attendance for ${formatDate(dayStart)}`}
        actions={<DatePicker value={dateKey} />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => (
          <div key={s.label} className="card-surface rounded-xl px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 pt-0">
          {rows.length === 0 ? (
            <EmptyState title="No employees yet" description="Add employees to start tracking attendance." />
          ) : (
            <AttendanceTable rows={rows} date={dateKey} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
