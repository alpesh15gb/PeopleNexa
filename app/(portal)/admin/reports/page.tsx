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

  const [departments, employees, records, leaves, shifts, holidays] = await Promise.all([
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
        salary: true,
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
    prisma.shift.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.holiday.findMany({
      where: { tenantId: session.tenantId, date: { gte: fromDate, lte: endOfDay(toDate) } },
      orderBy: { date: "asc" },
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
                  <TH>Half day</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                </TR>
              </THead>
              <TBody>
                {days.map((day) => {
                  const dayLeaves = leaveByDate.get(day);
                  const onLeave = dayLeaves ? dayLeaves.size : 0;
                  const dayRecords = records.filter((r) => toDateKey(r.date) === day);
                  const present = dayRecords.filter((r) => r.status === "present").length;
                  const late = dayRecords.filter((r) => r.status === "late").length;
                  const permission = dayRecords.filter((r) => r.status === "permission").length;
                  const halfDay = dayRecords.filter((r) => r.status === "half_day").length;
                  const absent = Math.max(employees.length - onLeave - present - late - permission - halfDay, 0);
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
                      <TD className="font-semibold text-violet-300">{halfDay}</TD>
                      <TD className="font-semibold text-indigo-300">{onLeave}</TD>
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

      {/* ── Shift-wise ──────────────────────────────────────────────── */}
      {type === "shift" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Shift</TH>
                  <TH>Employees</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Permission</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                </TR>
              </THead>
              <TBody>
                {shifts.map((shift) => {
                  const shiftEmployees = employees.filter((e) => e.shift?.name === shift.name);
                  const ids = new Set(shiftEmployees.map((e) => e.id));
                  const recs = records.filter((r) => ids.has(r.employee.id));
                  const empLeaves = leaves.filter((l) => ids.has(l.employee.id));
                  const present = recs.filter((r) => r.status === "present" || r.status === "half_day").length;
                  const late = recs.filter((r) => r.status === "late").length;
                  const permission = recs.filter((r) => r.status === "permission").length;
                  const onLeave = empLeaves.reduce((s, l) => s + l.days, 0);
                  const absent = Math.max(shiftEmployees.length * days.length - present - late - permission - onLeave, 0);
                  return (
                    <TR key={shift.id}>
                      <TD className="font-medium">{shift.name}</TD>
                      <TD>{shiftEmployees.length}</TD>
                      <TD className="font-semibold text-emerald-300">{present}</TD>
                      <TD className="font-semibold text-amber-300">{late}</TD>
                      <TD className="font-semibold text-sky-300">{permission}</TD>
                      <TD className="font-semibold text-indigo-300">{onLeave}</TD>
                      <TD className="font-semibold text-rose-300">{absent}</TD>
                    </TR>
                  );
                })}
                {shifts.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-6 text-center text-muted-foreground">No shifts configured.</TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Overtime ─────────────────────────────────────────────────── */}
      {type === "overtime" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH className="text-right">OT hours</TH>
                  <TH className="text-right">OT days</TH>
                  <TH className="text-right">Est. OT pay</TH>
                </TR>
              </THead>
              <TBody>
                {employees.map((emp) => {
                  const empRecs = records.filter((r) => r.employee.id === emp.id);
                  const hours = empRecs.reduce((s, r) => s + r.overtimeMinutes, 0) / 60;
                  const days = empRecs.filter((r) => r.overtimeMinutes > 0).length;
                  const base = emp.salary ?? 0;
                  const rate = base / 26 / 8;
                  const pay = hours * rate;
                  return (
                    <TR key={emp.id}>
                      <TD>
                        <p className="text-[13.5px] font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[11.5px] text-muted-foreground">{emp.employeeNumber}</p>
                      </TD>
                      <TD className="text-right font-mono text-[13px]">{hours.toFixed(1)}</TD>
                      <TD className="text-right font-mono text-[13px]">{days}</TD>
                      <TD className="text-right font-mono text-[13px] text-emerald-300">₹{pay.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Department-wise ──────────────────────────────────────────── */}
      {type === "department" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Department</TH>
                  <TH>Employees</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Permission</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                </TR>
              </THead>
              <TBody>
                {departments.map((dept) => {
                  const deptEmployees = employees.filter((e) => e.department?.name === dept.name);
                  const ids = new Set(deptEmployees.map((e) => e.id));
                  const recs = records.filter((r) => ids.has(r.employee.id));
                  const empLeaves = leaves.filter((l) => ids.has(l.employee.id));
                  const present = recs.filter((r) => r.status === "present" || r.status === "half_day").length;
                  const late = recs.filter((r) => r.status === "late").length;
                  const permission = recs.filter((r) => r.status === "permission").length;
                  const onLeave = empLeaves.reduce((s, l) => s + l.days, 0);
                  const absent = Math.max(deptEmployees.length * days.length - present - late - permission - onLeave, 0);
                  return (
                    <TR key={dept.id}>
                      <TD className="font-medium">{dept.name}</TD>
                      <TD>{deptEmployees.length}</TD>
                      <TD className="font-semibold text-emerald-300">{present}</TD>
                      <TD className="font-semibold text-amber-300">{late}</TD>
                      <TD className="font-semibold text-sky-300">{permission}</TD>
                      <TD className="font-semibold text-indigo-300">{onLeave}</TD>
                      <TD className="font-semibold text-rose-300">{absent}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Monthly trend ────────────────────────────────────────────── */}
      {type === "trend" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH>Present</TH>
                  <TH>Late</TH>
                  <TH>Permission</TH>
                  <TH>On leave</TH>
                  <TH>Absent</TH>
                  <TH className="text-right">Total days</TH>
                </TR>
              </THead>
              <TBody>
                {(() => {
                  const months: { key: string; present: number; late: number; permission: number; leave: number; absent: number; days: number }[] = [];
                  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    let m = months.find((x) => x.key === key);
                    if (!m) {
                      m = { key, present: 0, late: 0, permission: 0, leave: 0, absent: 0, days: 0 };
                      months.push(m);
                    }
                    m.days++;
                    const day = toDateKey(d);
                    const recs = records.filter((r) => toDateKey(r.date) === day);
                    const onLeave = leaveByDate.get(day)?.size ?? 0;
                    m.present += recs.filter((r) => r.status === "present" || r.status === "half_day").length;
                    m.late += recs.filter((r) => r.status === "late").length;
                    m.permission += recs.filter((r) => r.status === "permission").length;
                    m.leave += onLeave;
                  }
                  return months.map((m) => {
                    const total = m.days * employees.length;
                    const absent = Math.max(total - m.present - m.late - m.permission - m.leave, 0);
                    return (
                      <TR key={m.key}>
                        <TD className="font-medium">{m.key}</TD>
                        <TD className="font-semibold text-emerald-300">{m.present}</TD>
                        <TD className="font-semibold text-amber-300">{m.late}</TD>
                        <TD className="font-semibold text-sky-300">{m.permission}</TD>
                        <TD className="font-semibold text-indigo-300">{m.leave}</TD>
                        <TD className="font-semibold text-rose-300">{absent}</TD>
                        <TD className="text-right text-muted-foreground">{m.days}</TD>
                      </TR>
                    );
                  });
                })()}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Holiday-affected ─────────────────────────────────────────── */}
      {type === "holiday" && (
        <Card>
          <CardContent className="p-0 pt-0">
            {holidays.length === 0 ? (
              <EmptyState title="No holidays in this period" description="Add holidays to see who worked on them." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Holiday</TH>
                    <TH>Date</TH>
                    <TH>Type</TH>
                    <TH>Employees marked</TH>
                  </TR>
                </THead>
                <TBody>
                  {holidays.map((h) => {
                    const day = toDateKey(h.date);
                    const marked = records.filter((r) => toDateKey(r.date) === day);
                    return (
                      <TR key={h.id}>
                        <TD className="font-medium">{h.name}</TD>
                        <TD className="font-mono text-[13px]">{day}</TD>
                        <TD>{h.isHalfDay ? "Half day" : h.isRecurring ? "Recurring" : "Full day"}</TD>
                        <TD>{marked.length} employee(s) marked</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Attendance % ─────────────────────────────────────────────── */}
      {type === "attendance_pct" && (
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH className="text-right">Present</TH>
                  <TH className="text-right">Late</TH>
                  <TH className="text-right">On leave</TH>
                  <TH className="text-right">Absent</TH>
                  <TH className="text-right">Attendance %</TH>
                </TR>
              </THead>
              <TBody>
                {employees.map((emp) => {
                  const empRecs = records.filter((r) => r.employee.id === emp.id);
                  const empLeaves = leaves.filter((l) => l.employee.id === emp.id);
                  const present = empRecs.filter((r) => r.status === "present" || r.status === "half_day").length;
                  const late = empRecs.filter((r) => r.status === "late").length;
                  const permission = empRecs.filter((r) => r.status === "permission").length;
                  const onLeave = empLeaves.reduce((s, l) => s + l.days, 0);
                  const absent = Math.max(days.length - present - late - permission - onLeave, 0);
                  const marked = present + late + permission + onLeave;
                  const pct = days.length ? Math.round((marked / days.length) * 100) : 0;
                  return (
                    <TR key={emp.id}>
                      <TD>
                        <p className="text-[13.5px] font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[11.5px] text-muted-foreground">{emp.employeeNumber}</p>
                      </TD>
                      <TD className="text-right font-semibold text-emerald-300">{present}</TD>
                      <TD className="text-right font-semibold text-amber-300">{late}</TD>
                      <TD className="text-right font-semibold text-indigo-300">{onLeave}</TD>
                      <TD className="text-right font-semibold text-rose-300">{absent}</TD>
                      <TD className="text-right">
                        <span
                          className={`rounded-lg px-2.5 py-1 font-mono text-[12.5px] font-bold ${
                            pct >= 90 ? "bg-emerald-500/10 text-emerald-300" : pct >= 75 ? "bg-amber-500/10 text-amber-300" : "bg-rose-500/10 text-rose-300"
                          }`}
                        >
                          {pct}%
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Missing punches ─────────────────────────────────────────── */}
      {type === "missing" && (
        <Card>
          <CardContent className="p-0 pt-0">
            {(() => {
              // Employees with no attendance record on a working day (not leave, not holiday).
              const holidayDays = new Set(holidays.map((h) => toDateKey(h.date)));
              const empById = new Map(employees.map((e) => [e.id, e]));
              const missing: { day: string; employee: (typeof employees)[number]; issue: string }[] = [];
              for (const day of days) {
                if (holidayDays.has(day)) continue;
                const dow = fromDateKey(day).getDay();
                if (dow === 0) continue; // Sunday off
                const dayLeaves = leaveByDate.get(day) ?? new Map();
                const dayRecords = records.filter((r) => toDateKey(r.date) === day);
                const punched = new Set(dayRecords.map((r) => r.employee.id));
                for (const emp of employees) {
                  if (dayLeaves.has(emp.id) || punched.has(emp.id)) continue;
                  missing.push({ day, employee: emp, issue: "No punch" });
                }
                for (const r of dayRecords) {
                  if (r.punchInTime && !r.punchOutTime) {
                    const full = empById.get(r.employee.id) ?? (r.employee as (typeof employees)[number]);
                    missing.push({ day, employee: full, issue: "No punch-out" });
                  }
                }
              }
              const noPunch = missing.filter((m) => m.issue === "No punch");
              const noOut = missing.filter((m) => m.issue === "No punch-out");
              if (missing.length === 0) {
                return <EmptyState title="No missing punches 🎉" description="Every active employee punched in and out on working days in this period." />;
              }
              return (
                <>
                  <div className="flex flex-wrap gap-3 border-b border-edge px-5 py-4">
                    <div className="rounded-xl bg-rose-500/10 px-4 py-2.5">
                      <p className="font-display text-xl font-bold text-rose-300">{noPunch.length}</p>
                      <p className="text-[11px] text-muted-foreground">Missed clock-in</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 px-4 py-2.5">
                      <p className="font-display text-xl font-bold text-amber-300">{noOut.length}</p>
                      <p className="text-[11px] text-muted-foreground">Clocked in, no clock-out</p>
                    </div>
                    <p className="self-center text-[12.5px] text-muted-foreground">
                      Sundays and holidays excluded. Unreconciled days can be fixed via Regularization.
                    </p>
                  </div>
                  <Table id="report-table">
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH>Employee</TH>
                        <TH>Issue</TH>
                        <TH>Department</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {missing
                        .sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1))
                        .map((m, i) => (
                          <TR key={i}>
                            <TD className="font-mono text-[13px]">{m.day}</TD>
                            <TD>
                              <p className="text-[13.5px] font-medium">{m.employee.firstName} {m.employee.lastName}</p>
                              <p className="text-[11.5px] text-muted-foreground">{m.employee.employeeNumber}</p>
                            </TD>
                            <TD>
                              <span className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ${m.issue === "No punch" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                                {m.issue}
                              </span>
                            </TD>
                            <TD className="text-[13px] text-muted-foreground">{m.employee.department?.name ?? "—"}</TD>
                          </TR>
                        ))}
                    </TBody>
                  </Table>
                </>
              );
            })()}
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
