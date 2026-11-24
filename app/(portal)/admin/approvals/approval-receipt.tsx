import Link from "next/link";
import { StatusPill } from "@/components/ui/badge";
import type { Prisma } from "@/generated/prisma/client";
import { istDateKey } from "@/lib/ist";
import { prisma } from "@/lib/prisma";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime } from "@/lib/workspace-time";

export async function ApprovalReceipt({ result, tenantId, actorId, backHref, region, correctionScope, leaveScope }: {
  result: string;
  tenantId: string;
  actorId: string;
  backHref: string;
  region: WorkspaceRegion;
  correctionScope?: Prisma.PunchCorrectionWhereInput;
  leaveScope?: Prisma.LeaveRequestWhereInput;
}) {
  const match = /^(correction|leave)\.([a-zA-Z0-9_-]{1,100})$/.exec(result);
  if (!match) return null;
  const [, kind, id] = match;
  const employee = { select: { firstName: true, lastName: true } } as const;
  const dateLabel = (date: Date) => formatCalendarDate(istDateKey(date), region.locale);
  let title: string;
  let subject: string;
  let status: string;
  let note: string | null;
  let times: { in: string; out: string } | undefined;

  if (kind === "correction" && correctionScope) {
    const correction = await prisma.punchCorrection.findFirst({
      where: { tenantId, id, reviewedBy: actorId, status: { in: ["approved", "rejected"] }, AND: [correctionScope] },
      select: { employeeId: true, date: true, reviewNote: true, status: true, employee },
    });
    if (!correction) return null;
    title = correction.status === "approved" ? "Correction approved" : "Correction declined";
    subject = `${correction.employee.firstName} ${correction.employee.lastName} · ${dateLabel(correction.date)}`;
    status = correction.status;
    note = correction.reviewNote;
    const attendance = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: correction.employeeId, date: correction.date }, tenantId }, select: { punchInTime: true, punchOutTime: true } });
    if (attendance) {
      const showPunch = (punch: Date | null) => {
        if (!punch) return "—";
        const date = dateKeyInTimeZone(punch, region.timeZone);
        return `${date === istDateKey(correction.date) ? "" : `${formatCalendarDate(date, region.locale)} · `}${formatWorkspaceTime(punch, region)}`;
      };
      times = { in: showPunch(attendance.punchInTime), out: showPunch(attendance.punchOutTime) };
    }
  } else if (kind === "leave" && leaveScope) {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id, tenantId, AND: [leaveScope] },
      select: { status: true, reviewedBy: true, reviewNote: true, fromDate: true, toDate: true, employee, leaveType: { select: { name: true } } },
    });
    if (!leave) return null;
    const cancellation = await prisma.auditLog.findFirst({
      where: { tenantId, actorId, entity: "LeaveRequest", entityId: id, action: { in: ["leave.cancellation.approve", "leave.cancellation.reject"] } },
      select: { action: true, summary: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!cancellation && (leave.reviewedBy !== actorId || !["approved", "rejected"].includes(leave.status))) return null;
    title = cancellation ? cancellation.action === "leave.cancellation.approve" ? "Cancellation approved" : "Cancellation declined" : leave.status === "approved" ? "Leave approved" : "Leave declined";
    const from = dateLabel(leave.fromDate);
    const to = dateLabel(leave.toDate);
    subject = `${leave.employee.firstName} ${leave.employee.lastName} · ${leave.leaveType.name} · ${from === to ? from : `${from} – ${to}`}`;
    status = leave.status;
    note = cancellation?.summary ?? leave.reviewNote;
  } else {
    return null;
  }

  return <section id="review-result" aria-label="Saved decision" className="scroll-mt-24 rounded-xl border border-edge bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0" role="status"><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{subject}</p></div>
      <div className="flex items-center gap-3"><StatusPill status={status} /><Link href={backHref} replace scroll={false} className="text-sm font-medium text-primary hover:underline">Dismiss</Link></div>
    </div>
    {times && <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <div><dt className="text-xs text-muted-foreground">Current check-in</dt><dd className="tabular-nums">{times.in}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Current check-out</dt><dd className="tabular-nums">{times.out}</dd></div>
    </dl>}
    {note && <p className="mt-2 whitespace-pre-wrap break-words text-sm"><span className="font-medium">Review note</span> · {note}</p>}
  </section>;
}
