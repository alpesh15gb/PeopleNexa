import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { istDateKey } from "@/lib/ist";
import type { Lang } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { attendanceDayForPunch, shiftForEmployeeDay, shiftWindow } from "@/lib/reconcile";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime } from "@/lib/workspace-time";
import { ClockCard } from "../clock-card";

type ClockEmployee = {
  id: string;
  tenantId: string;
  branchId: string | null;
  shiftId: string | null;
  firstName: string;
  lastName: string;
  branch: { name: string; latitude: number | null; longitude: number | null; geofenceRadius: number } | null;
};

export async function TodayAttendance({ employee, region, lang, now, showCorrection }: {
  employee: ClockEmployee;
  region: WorkspaceRegion;
  lang: Lang;
  now: Date;
  showCorrection: boolean;
}) {
  const scope = { tenantId: employee.tenantId, employeeId: employee.id };
  const workDay = await attendanceDayForPunch(employee, now, region.timeZone);
  const dayKey = istDateKey(workDay);
  const shift = await shiftForEmployeeDay(employee, workDay, region.timeZone);
  const window = shiftWindow(workDay, shift, region.timeZone);
  const [record, reviewedPunches, correction] = await Promise.all([
    prisma.attendance.findFirst({ where: { ...scope, date: workDay }, select: {
      id: true, punchInTime: true, punchOutTime: true, punchInLat: true, punchInLng: true, status: true, lateMinutes: true, reviewStatus: true,
    } }),
    prisma.punch.findMany({ where: { ...scope, authStatus: { in: ["pending", "declined"] }, punchTime: { gte: window.start, lt: window.end } }, select: { id: true, authStatus: true, inOutHint: true, punchTime: true }, orderBy: { punchTime: "desc" } }),
    prisma.punchCorrection.findFirst({ where: { ...scope, date: workDay, status: "pending" }, select: { id: true } }),
  ]);
  const punches = [];
  for (const punch of reviewedPunches) {
    if (+await attendanceDayForPunch(employee, punch.punchTime, region.timeZone) === +workDay) punches.push(punch);
  }
  const pending = punches.filter((punch) => punch.authStatus === "pending");
  const href = `/employee/attendance?view=corrections&month=${dayKey.slice(0, 7)}`;
  const today = dateKeyInTimeZone(now, region.timeZone);

  return (
    <section aria-label="Current attendance" className="space-y-4">
      {today !== dayKey && <p className="text-sm text-muted-foreground">Overnight work date <strong>{formatCalendarDate(dayKey, region.locale)}</strong></p>}
      <ClockCard
        record={record}
        shift={shift}
        branch={employee.branch}
        employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
        region={region}
        lang={lang}
        pendingApproval={pending.length > 0}
        pendingIn={pending.some((punch) => punch.inOutHint !== "out")}
        pendingOut={pending.some((punch) => punch.inOutHint === "out")}
      />
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-semibold">Punch status</h2>
            {correction ? <Link href={`${href}#corrections-${dayKey}`} className="inline-flex min-h-10 items-center font-medium text-primary hover:underline">View pending correction</Link> : showCorrection && <Link href={`${href}&action=request&date=${dayKey}`} className="inline-flex min-h-10 items-center font-medium text-primary hover:underline">Request a correction</Link>}
          </div>
          {punches.length > 0 ? (
            <ul className="space-y-2 text-sm">{punches.map((punch) => (
              <li key={punch.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-2">
                <span>{punch.inOutHint === "in" ? "Clock-in" : punch.inOutHint === "out" ? "Clock-out" : "Punch"} · {formatWorkspaceTime(punch.punchTime, region)}</span>
                <Badge tone={punch.authStatus === "pending" ? "warning" : "danger"}>{punch.authStatus === "pending" ? "Awaiting manager review" : "Declined"}</Badge>
              </li>
            ))}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">{record?.reviewStatus === "missed_punch" ? "A punch is missing. Request a correction to add it." : record?.reviewStatus === "needs_review" ? "This workday needs review. Check your times and request a correction if needed." : record?.punchInTime || record?.punchOutTime ? "Your recorded punches appear above." : "Your recorded punches will appear here after you clock in."}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
