import { unprocessedAttendanceSourceDays } from "@/lib/attendance-source-recovery";
import { formatAttendanceClockIST } from "@/lib/device-report";
import { assessAttendanceDay, isAttendanceHoliday, isScheduledWeeklyOff } from "@/lib/attendance-assessment";
import { authorizedPunchDayFilter } from "@/lib/attendance-presence";
import { istDateKey } from "@/lib/ist";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { startOfDay, toDateKey, addDays, monthKey, formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { CalendarClock } from "lucide-react";
import { CorrectionsPanel } from "./corrections-panel";

export const dynamic = "force-dynamic";

export default async function EmployeeAttendancePage() {
  const session = await requireSession();
  const lang = await getLang();
  const today = startOfDay(new Date());

  const [records, leaves, holidays, corrections, employee, punches, rosters] = await Promise.all([
    prisma.attendance.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub, date: { lte: today } },
      include: { branch: { select: { name: true } }, shift: { select: { name: true, sundayWeeklyOff: true } } },
      orderBy: { date: "desc" },
      take: 60,
    }),
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub, status: "approved" },
      include: { leaveType: true },
    }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId } }),
    prisma.punchCorrection.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { id: true, employeeNumber: true, deviceCode: true, joiningDate: true, shift: { select: { sundayWeeklyOff: true } } } }),
    prisma.punch.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, ...authorizedPunchDayFilter(addDays(today,-60), addDays(today,1)) }, select: { punchTime: true } }),
    prisma.rosterAssignment.findMany({ where: { tenantId: session.tenantId, employeeId: session.sub, date: { gte: addDays(today,-60), lte: today } }, include: { shift: true } }),
  ]);

  const recordByDay = new Map(records.map((r) => [toDateKey(r.date), r]));
  const todayRecord = recordByDay.get(toDateKey(today));
  const leaveByDay = new Map<string, { type: string; color: string }>();
  for (const l of leaves) {
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) {
      leaveByDay.set(toDateKey(d), { type: l.leaveType.name, color: l.leaveType.color });
    }
  }
  const sourceRecoveryDays = await unprocessedAttendanceSourceDays(session.tenantId, employee ? [employee] : [], addDays(today,-60), addDays(today,1));
  const punched = new Set(punches.map(p => istDateKey(p.punchTime)));
  const rosterByDay = new Map(rosters.map(r => [istDateKey(r.date), r.shift]));
  const assessmentFor = (day: Date) => {
    const key = toDateKey(day), record = recordByDay.get(key);
    const shift = rosterByDay.get(key) ?? record?.shift ?? employee?.shift;
    return assessAttendanceDay({ day: key, joiningDate: employee?.joiningDate, record, hasShift: Boolean(shift), hasAuthorizedPunch: punched.has(key), hasUnprocessedSource: sourceRecoveryDays.has(`${session.sub}|${key}`), holiday: isAttendanceHoliday(key, holidays), leave: leaveByDay.has(key), weeklyOff: isScheduledWeeklyOff(key, shift) });
  };
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -29 + i));
  const month = monthKey(today);
  const monthDays = Array.from({ length: Number(toDateKey(today).slice(8)) }, (_, i) => addDays(today, -i));
  const monthAssessments = monthDays.map(assessmentFor);
  const present = monthAssessments.filter(a => a.assessedPresent).length;
  const late = monthAssessments.filter(a => a.status === "late").length;
  const onLeave = monthAssessments.filter(a => a.status === "on_leave").length;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "attendance.title")}
        description={`${month} — ${present} ${t(lang, "common.present").toLowerCase()} · ${late} ${t(lang, "common.late").toLowerCase()} · ${onLeave} ${t(lang, "common.onLeave").toLowerCase()}`}
      />

      {/* 30-day heat grid — color is redundant: each cell also exposes text via aria + table fallback */}
      <Card>
        <CardContent className="p-5">
          <div
            role="img"
            aria-label={`Last 30 days: ${present} present, ${late} late, ${onLeave} on leave this month.`}
            className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-15"
          >
            {days.map((day) => {
              const key = toDateKey(day);
              const isToday = key === toDateKey(today);
              const assessment = assessmentFor(day);
              const bg = assessment.requiresReview || assessment.status === "pending" ? "bg-amber-400/25"
                : assessment.status === "late" ? "bg-amber-400/50"
                : assessment.assessedPresent ? "bg-emerald-400/60"
                : assessment.status === "absent" ? "bg-rose-400/20"
                : assessment.status === "on_leave" ? "bg-indigo-500/30"
                : assessment.status === "holiday" ? "bg-violet-500/25" : "bg-tint";
              const title = `${key} · ${assessment.code}`;
              return (
                <div
                  key={key}
                  title={title}
                  tabIndex={0}
                  role="img"
                  aria-label={title}
                  className={`relative aspect-square min-h-[28px] rounded-md ${bg} focus-visible:outline-2 focus-visible:outline-primary ${isToday ? "ring-2 ring-indigo-400" : ""}`}
                >
                  <span className="sr-only">{title}</span>
                </div>
              );
            })}
          </div>
          {/* Screen-reader table fallback for the same 30-day data */}
          <table className="sr-only">
            <caption>Attendance for the last 30 days</caption>
            <tbody>
              {days.map((day) => {
                const key = toDateKey(day);
                const text = assessmentFor(day).code;
                return (
                  <tr key={key}>
                    <th scope="row">{key}</th>
                    <td>{text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-400/60" /> {t(lang, "common.present")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-400/50" /> {t(lang, "common.late")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-400/20" /> {t(lang, "attendance.absent")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-indigo-500/30" /> {t(lang, "common.onLeave")}</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-400/25" /> Pending / Review</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-500/25" /> {t(lang, "attendance.legendHoliday")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Punch corrections */}
      <CorrectionsPanel
        corrections={corrections.map((c) => ({
          id: c.id,
          date: c.date.toISOString(),
          currentIn: c.currentIn?.toISOString() ?? null,
          currentOut: c.currentOut?.toISOString() ?? null,
          requestedIn: c.requestedIn?.toISOString() ?? null,
          requestedOut: c.requestedOut?.toISOString() ?? null,
          reason: c.reason,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        }))}
        lang={lang}
      />

      {/* History table */}
      <Card>
        <CardContent className="p-0 pt-0">
          {records.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title={t(lang, "attendance.noRecords")}
              description={t(lang, "attendance.noRecordsDesc")}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t(lang, "attendance.date")}</TH>
                  <TH>{t(lang, "attendance.in")}</TH>
                  <TH>{t(lang, "attendance.out")}</TH>
                  <TH className="hidden md:table-cell">{t(lang, "attendance.branchShift")}</TH>
                  <TH>{t(lang, "attendance.status")}</TH>
                </TR>
              </THead>
              <TBody>
                {records.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-[13px]">{formatDate(r.date)}</TD>
                    <TD className="font-mono text-[13px]">{formatAttendanceClockIST(r.punchInTime, r.date) || "—"}</TD>
                    <TD className="font-mono text-[13px]">{formatAttendanceClockIST(r.punchOutTime, r.date) || "—"}</TD>
                    <TD className="hidden md:table-cell">
                      <span className="text-[13px] text-muted-foreground">
                        {r.branch?.name ?? "—"} · {r.shift?.name ?? "—"}
                      </span>
                    </TD>
                    <TD><StatusPill status={assessmentFor(r.date).status} lang={lang} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
