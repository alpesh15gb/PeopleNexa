import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { startOfDay, toDateKey, addDays, monthKey, formatTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/stat";
import { CalendarClock } from "lucide-react";
import { CorrectionsPanel } from "./corrections-panel";
import { LocationPinger } from "./location-pinger";

export const dynamic = "force-dynamic";

export default async function EmployeeAttendancePage() {
  const session = await requireSession();
  const lang = await getLang();
  const today = startOfDay(new Date());

  const [records, leaves, holidays, corrections] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId: session.sub, date: { lte: today } },
      include: { branch: { select: { name: true } }, shift: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 60,
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: session.sub, status: "approved" },
      include: { leaveType: true },
    }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId } }),
    prisma.punchCorrection.findMany({
      where: { employeeId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const recordByDay = new Map(records.map((r) => [toDateKey(r.date), r]));
  const todayRecord = recordByDay.get(toDateKey(today));
  const openSession = todayRecord ? Boolean(todayRecord.punchInTime && !todayRecord.punchOutTime) : false;
  const leaveByDay = new Map<string, { type: string; color: string }>();
  for (const l of leaves) {
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) {
      leaveByDay.set(toDateKey(d), { type: l.leaveType.name, color: l.leaveType.color });
    }
  }
  const holidayByDay = new Map(holidays.map((h) => [toDateKey(h.date), h.name]));

  // Last 30 days grid
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -29 + i));

  const month = monthKey(today);
  const monthRecords = records.filter((r) => monthKey(r.date) === month);
  const monthLeaves = leaves.filter((l) => monthKey(l.fromDate) === month);
  const present = monthRecords.filter((r) => r.status === "present" || r.status === "half_day").length;
  const late = monthRecords.filter((r) => r.status === "late").length;
  const onLeave = monthLeaves.reduce((s, l) => s + l.days, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "attendance.title")}
        description={`${month} — ${present + late} ${t(lang, "common.present").toLowerCase()} · ${late} ${t(lang, "common.late").toLowerCase()} · ${onLeave} ${t(lang, "common.onLeave").toLowerCase()}`}
        actions={<LocationPinger active={openSession} />}
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
              const record = recordByDay.get(key);
              const leave = leaveByDay.get(key);
              const holiday = holidayByDay.get(key);
              let bg = "bg-tint";
              let statusText = t(lang, "attendance.absent");
              let title = key;
              if (holiday) {
                bg = "bg-violet-500/25";
                statusText = t(lang, "attendance.holiday", { name: holiday });
                title = `${key} · ${statusText}`;
              } else if (leave) {
                bg = "bg-indigo-500/30";
                statusText = t(lang, "attendance.onLeaveTitle", { type: leave.type });
                title = `${key} · ${statusText}`;
              } else if (record) {
                bg = record.status === "late" ? "bg-amber-400/50" : record.status === "permission" ? "bg-sky-400/50" : "bg-emerald-400/60";
                statusText = `${t(lang, `status.${record.status}`)}${record.punchInTime ? " · " + t(lang, "attendance.in").toLowerCase() + " " + formatTime(record.punchInTime) : ""}`;
                title = `${key} · ${statusText}`;
              } else if (day.getDay() === 0) {
                bg = "bg-tint";
                statusText = t(lang, "attendance.sunday");
                title = `${key} · ${statusText}`;
              } else {
                bg = "bg-rose-400/20";
                title = `${key} · ${statusText}`;
              }
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
                const record = recordByDay.get(key);
                const leave = leaveByDay.get(key);
                const holiday = holidayByDay.get(key);
                const text = holiday
                  ? `Holiday: ${holiday}`
                  : leave
                    ? `On leave: ${leave.type}`
                    : record
                      ? t(lang, `status.${record.status}`)
                      : day.getDay() === 0
                        ? t(lang, "attendance.sunday")
                        : t(lang, "attendance.absent");
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
                    <TD className="font-mono text-[13px]">{toDateKey(r.date)}</TD>
                    <TD className="font-mono text-[13px]">{formatTime(r.punchInTime)}</TD>
                    <TD className="font-mono text-[13px]">{formatTime(r.punchOutTime)}</TD>
                    <TD className="hidden md:table-cell">
                      <span className="text-[13px] text-muted-foreground">
                        {r.branch?.name ?? "—"} · {r.shift?.name ?? "—"}
                      </span>
                    </TD>
                    <TD><StatusPill status={r.status} lang={lang} /></TD>
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
