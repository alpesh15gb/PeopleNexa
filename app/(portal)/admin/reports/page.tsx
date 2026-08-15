import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { fromDateKey, endOfDay, toDateKey, addDays, formatTime, todayKey } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/stat";
import { ReportControls } from "./report-controls";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  present: "#34d399",
  late: "#fbbf24",
  permission: "#38bdf8",
  absent: "#fb7185",
  half_day: "#a78bfa",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string; departmentId?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const type = params.type || "daily";
  const from = params.from || toDateKey(addDays(new Date(), -29));
  const to = params.to || todayKey();
  const departmentId = params.departmentId;

  const fromDate = fromDateKey(from);
  const toDate = fromDateKey(to);

  const [departments, employees, records, leaves] = await Promise.all([
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", ...(departmentId ? { departmentId } : {}) },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        shift: { select: { name: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.attendance.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: fromDate, lte: endOfDay(toDate) },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } }, shift: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        status: "approved",
        fromDate: { lte: endOfDay(toDate) },
        toDate: { gte: fromDate },
        ...(departmentId ? { employee: { departmentId } } : {}),
      },
      include: { employee: { select: { id: true } }, leaveType: true },
    }),
  ]);

  const days: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) days.push(toDateKey(d));

  const leaveByDate = new Map<string, Map<string, { type: string; color: string }>>();
  for (const l of leaves) {
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) {
      const key = toDateKey(d);
      if (!leaveByDate.has(key)) leaveByDate.set(key, new Map());
      leaveByDate.get(key)!.set(l.employee.id, { type: l.leaveType.name, color: l.leaveType.color });
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Reports" description="Attendance analytics and exports" />
      <Card>
        <CardContent className="p-5">
          <ReportControls type={type} from={from} to={to} departments={departments} />
        </CardContent>
      </Card>

      {/* ── Daily summary ─────────────────────────────────────────────── */}
      {type === "daily" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table id="report-table">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Permission</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                </TR>
              </THead>
              <TBody>
                {days.map((day) => {
                  const dayLeaves = leaveByDate.get(day);
                  const onLeave = dayLeaves ? dayLeaves.size : 0;
                  const dayRecords = records.filter((r) => toDateKey(r.date) === day);
                  const present = dayRecords.filter((r) => r.status === "present" || r.status === "half_day").length;
                  const late = dayRecords.filter((r) => r.status === "late").length;
                  const permission = dayRecords.filter((r) => r.status === "permission").length;
                  const absent = Math.max(employees.length - onLeave - present - late - permission, 0);
                  const isToday = day === todayKey();
                  return (
                    <TR key={day} className={isToday ? "bg-indigo-500/[0.06]" : ""}>
                      <TD className="font-medium">
                        {day}
                        {isToday && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">Today</span>}
                      </TD>
                      <TD className="font-semibold text-emerald-300">{present}</TD>
                      <TD className="font-semibold text-amber-300">{late}</TD>
                      <TD className="font-semibold text-sky-300">{permission}</TD>
                      <TD className="font-semibold text-violet-300">{onLeave}</TD>
                      <TD className="font-semibold text-rose-300">{absent}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Monthly per-employee ──────────────────────────────────────── */}
      {type === "monthly" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table id="report-table">
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Permission</TH>
                  <TH>Half day</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                  <TH className="text-right">Late (min)</TH>
                </TR>
              </THead>
              <TBody>
                {employees.map((emp) => {
                  const empRecords = records.filter((r) => r.employee.id === emp.id);
                  const empLeaves = leaves.filter((l) => l.employee.id === emp.id);
                  const present = empRecords.filter((r) => r.status === "present" || r.status === "half_day").length;
                  const late = empRecords.filter((r) => r.status === "late").length;
                  const permission = empRecords.filter((r) => r.status === "permission").length;
                  const halfDay = empRecords.filter((r) => r.status === "half_day").length;
                  const onLeave = empLeaves.reduce((s, l) => s + l.days, 0);
                  const absent = Math.max(days.length - present - late - permission - onLeave, 0);
                  const lateMinutes = empRecords.reduce((s, r) => s + r.lateMinutes, 0);
                  return (
                    <TR key={emp.id}>
                      <TD>
                        <p className="text-[13.5px] font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[11.5px] text-muted-foreground">{emp.employeeNumber}</p>
                      </TD>
                      <TD className="font-semibold text-emerald-300">{present}</TD>
                      <TD className="font-semibold text-amber-300">{late}</TD>
                      <TD className="font-semibold text-sky-300">{permission}</TD>
                      <TD className="font-semibold text-violet-300">{halfDay}</TD>
                      <TD className="font-semibold text-indigo-300">{onLeave}</TD>
                      <TD className="font-semibold text-rose-300">{absent}</TD>
                      <TD className="text-right font-mono text-[12.5px] text-muted-foreground">{lateMinutes}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Present / Absent matrix ───────────────────────────────────── */}
      {type === "matrix" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <div className="overflow-x-auto">
              <table id="report-table" className="w-full text-sm">
                <thead className="border-b border-edge">
                  <tr>
                    <th className="sticky left-0 z-10 h-10 bg-card px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Employee
                    </th>
                    {days.map((day) => (
                      <th key={day} className="h-10 px-1 text-center text-[10px] font-semibold text-muted-foreground">
                        {day.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-tint">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4">
                        <p className="text-[13px] font-medium">{emp.firstName} {emp.lastName}</p>
                      </td>
                      {days.map((day) => {
                        const onLeave = leaveByDate.get(day)?.get(emp.id);
                        const record = records.find((r) => r.employee.id === emp.id && toDateKey(r.date) === day);
                        let cell: { key: string; color: string; title: string } | null = null;
                        if (onLeave) cell = { key: "L", color: onLeave.color, title: onLeave.type };
                        else if (!record) cell = { key: "A", color: COLORS.absent, title: "Absent" };
                        else {
                          const map: Record<string, string> = { present: "P", late: "LT", permission: "PR", half_day: "HD" };
                          cell = { key: map[record.status] ?? record.status.charAt(0).toUpperCase(), color: COLORS[record.status] ?? "#94a3b8", title: record.status };
                        }
                        return (
                          <td key={day} className="px-0.5 py-1.5 text-center">
                            <span
                              title={`${day} — ${cell.title}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[10.5px] font-bold"
                              style={{ background: `${cell.color}22`, color: cell.color }}
                            >
                              {cell.key}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-edge px-5 py-3 text-[11.5px] text-muted-foreground">
              {Object.entries({ present: "P", late: "LT", permission: "PR", half_day: "HD", absent: "A" }).map(([k, short]) => (
                <span key={k} className="flex items-center gap-1.5 capitalize">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ background: `${COLORS[k]}22`, color: COLORS[k] }}>
                    {short}
                  </span>
                  {k.replace("_", " ")}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-indigo-300" style={{ background: "#818cf822" }}>L</span>
                On leave
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Late-comers ───────────────────────────────────────────────── */}
      {type === "late" && (
        <Card>
          <CardContent className="p-0 pt-0">
            {records.filter((r) => r.status === "late").length === 0 ? (
              <EmptyState title="No late punches" description="Everyone clocked in on time in this period. 🎉" />
            ) : (
              <Table id="report-table">
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Employee</TH>
                    <TH>Shift</TH>
                    <TH className="text-right">Late by</TH>
                  </TR>
                </THead>
                <TBody>
                  {records
                    .filter((r) => r.status === "late")
                    .sort((a, b) => b.lateMinutes - a.lateMinutes)
                    .map((r) => (
                      <TR key={r.id}>
                        <TD className="font-mono text-[13px]">{toDateKey(r.date)}</TD>
                        <TD className="text-[13.5px] font-medium">
                          {r.employee.firstName} {r.employee.lastName}
                        </TD>
                        <TD className="text-[13px] text-muted-foreground">{r.shift?.name ?? "—"}</TD>
                        <TD className="text-right">
                          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 font-mono text-[12.5px] font-bold text-amber-300">
                            {r.lateMinutes} min
                          </span>
                        </TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
