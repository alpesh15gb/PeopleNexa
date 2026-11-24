import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SessionPayload } from "@/lib/auth";
import { pendingApprovalFilters, type PendingApprovalFilters } from "@/lib/approval-workspace";
import { dayRangeIST } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";
import { istDateKey } from "@/lib/ist";
import { countsAsLeaveDay } from "@/lib/leave-calendar";
import { prisma } from "@/lib/prisma";
import { workspaceRegion, type WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime, offsetDateKey } from "@/lib/workspace-time";
import { ApprovalDrawer } from "./approval-drawer";
import { ApprovalReceipt } from "./approval-receipt";

const employeeName = { firstName: true, lastName: true } as const;
const leaveSummary = {
  id: true, fromDate: true, toDate: true, days: true, appliedAt: true, cancellationRequestedAt: true,
  employee: { select: employeeName }, leaveType: { select: { name: true } },
} as const;
const correctionSummary = { id: true, date: true, createdAt: true, employee: { select: employeeName } } as const;

function displayName(employee: { firstName: string; lastName: string }) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function rangeLabel(from: Date, to: Date, locale: string) {
  const start = formatCalendarDate(istDateKey(from), locale);
  const end = formatCalendarDate(istDateKey(to), locale);
  return start === end ? start : `${start} – ${end}`;
}

export function approvalItemHref(key: string, backHref: string) {
  const url = new URL(backHref, "https://inbox.local");
  url.searchParams.set("item", key);
  return `${url.pathname}${url.search}`;
}

export function approvalResultHref(key: string, backHref: string) {
  const url = new URL(backHref, "https://inbox.local");
  url.searchParams.set("result", key);
  return `${url.pathname}${url.search}#review-result`;
}

async function LeaveOverlap({ request, scope, locale }: {
  request: { tenantId: string; employeeId: string; fromDate: Date; toDate: Date; leavePolicySnapshot: unknown; employee: { managerId: string | null; branchId: string | null } };
  scope?: Prisma.LeaveRequestWhereInput["employee"];
  locale: string;
}) {
  const { managerId, branchId } = request.employee;
  if (!managerId && !branchId) return <p className="rounded-lg bg-tint p-3 text-sm text-muted-foreground">Team overlap is unavailable because this employee has no assigned manager or branch.</p>;

  const first = istDateKey(request.fromDate);
  const last = istDateKey(request.toDate);
  const limit = 100;
  const overlapping = await prisma.leaveRequest.findMany({
    where: {
      tenantId: request.tenantId,
      employeeId: { not: request.employeeId },
      AND: [{ employee: scope }, { employee: managerId ? { managerId } : { branchId } }],
      status: "approved",
      fromDate: { lt: dayRangeIST(last).end }, toDate: { gte: dayRangeIST(first).start },
    },
    select: { id: true, fromDate: true, toDate: true, leavePolicySnapshot: true, employee: { select: employeeName } },
    orderBy: [{ fromDate: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const matches = overlapping.slice(0, limit).flatMap((other) => {
    const otherFirst = istDateKey(other.fromDate);
    const otherLast = istDateKey(other.toDate);
    const end = otherLast < last ? otherLast : last;
    const dates: string[] = [];
    for (let day = otherFirst > first ? otherFirst : first; day <= end; day = offsetDateKey(day, 1)) {
      if (countsAsLeaveDay(request.leavePolicySnapshot, day) && countsAsLeaveDay(other.leavePolicySnapshot, day)) dates.push(day);
    }
    return dates.length ? [{ ...other, dates }] : [];
  });
  const complete = overlapping.length <= limit;

  return <section className="rounded-lg border border-edge p-4" aria-label="Approved leave overlap">
    <h3 className="text-sm font-semibold">Approved leave overlap</h3>
    <p className="mt-1 text-xs text-muted-foreground">{managerId ? "Employees with the same assigned manager" : "Employees in the same branch"} in your review scope.</p>
    {matches.length > 0 ? <ul className="mt-3 space-y-2 text-sm">
      {matches.slice(0, 10).map((match) => <li key={match.id}>
        <span className="font-medium">{displayName(match.employee)}</span>
        <span className="block text-xs text-muted-foreground">{match.dates.slice(0, 5).map((date) => formatCalendarDate(date, locale)).join(", ")}{match.dates.length > 5 ? ` and ${match.dates.length - 5} more` : ""}</span>
      </li>)}
    </ul> : <p className="mt-3 text-sm">{complete ? "No approved leave overlaps these dates." : "No overlaps found in the first 100 requests."}</p>}
    {(matches.length > 10 || !complete) && <p className="mt-3 text-sm text-muted-foreground">Additional requests may overlap these dates. <Link href="/admin/leaves?view=calendar" className="font-medium text-primary underline">Open the team calendar</Link></p>}
  </section>;
}

function PunchChange({ label, previous, requested, current, region }: { label: string; previous: Date | null; requested: Date | null; current: Date | null; region: WorkspaceRegion }) {
  const describe = (value: Date) => `${formatCalendarDate(dateKeyInTimeZone(value, region.timeZone), region.locale)} at ${formatWorkspaceTime(value, region)}`;
  return <div className="rounded-lg bg-tint p-3">
    <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
    <dd className="mt-1 space-y-1 text-sm">
      <div className="text-muted-foreground">Recorded at submission · {previous ? describe(previous) : "None"}</div>
      {previous?.getTime() !== current?.getTime() && <div className="font-medium text-amber-800 dark:text-amber-300">Current attendance · {current ? describe(current) : "None"}</div>}
      <div>{requested ? `Requested · ${describe(requested)}` : "No change requested"}</div>
    </dd>
  </div>;
}

export async function PriorityApprovals({ session, modules, filters, selectedKey, result, backHref = "/admin/approvals", limit = 8 }: {
  session: SessionPayload;
  modules: ReadonlySet<string>;
  filters?: PendingApprovalFilters;
  selectedKey?: string;
  result?: string;
  backHref?: string;
  limit?: number;
}) {
  const scope = filters ?? await pendingApprovalFilters(session);
  const leave = modules.has("leaves") ? scope.leave : undefined;
  const correction = modules.has("attendance") ? scope.correction : undefined;
  if (!leave && !correction && !selectedKey) return null;
  const [pending, cancellations, corrections, tenant] = await Promise.all([
    leave ? prisma.leaveRequest.findMany({ where: { AND: [leave, { status: "pending" }] }, orderBy: [{ appliedAt: "asc" }, { id: "asc" }], select: leaveSummary, take: limit }) : [],
    leave ? prisma.leaveRequest.findMany({ where: { AND: [leave, { status: "approved" }] }, orderBy: [{ cancellationRequestedAt: { sort: "asc", nulls: "last" } }, { appliedAt: "asc" }, { id: "asc" }], select: leaveSummary, take: limit }) : [],
    correction ? prisma.punchCorrection.findMany({ where: correction, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: correctionSummary, take: limit }) : [],
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const region = workspaceRegion(tenant?.config);
  const rows = [
    ...[...pending, ...cancellations].map((item) => ({ key: `leave.${item.id}`, title: item.cancellationRequestedAt ? "Leave cancellation" : "Leave request", name: displayName(item.employee), details: `${item.leaveType.name} · ${rangeLabel(item.fromDate, item.toDate, region.locale)}`, addedAt: item.cancellationRequestedAt ?? item.appliedAt })),
    ...corrections.map((item) => ({ key: `correction.${item.id}`, title: "Punch correction", name: displayName(item.employee), details: formatCalendarDate(istDateKey(item.date), region.locale), addedAt: item.createdAt })),
  ].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime() || a.key.localeCompare(b.key)).slice(0, limit);

  return <>
    {result && <ApprovalReceipt result={result} tenantId={session.tenantId} actorId={session.sub} backHref={backHref} region={region} correctionScope={correction && { employee: correction.employee }} leaveScope={leave && { employee: leave.employee }} />}
    {rows.length > 0 && <section aria-label="Priority approvals" className="min-w-0">
      <h2 className="mb-3 font-display text-lg font-semibold">Priority approvals</h2>

      <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
        {rows.map((row) => <li key={row.key}>
          <Link href={approvalItemHref(row.key, backHref)} prefetch={false} scroll={false} className="flex min-w-0 items-center gap-3 rounded-lg px-4 py-3 hover:bg-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold">{row.name} <span className="font-normal text-muted-foreground">· {row.title}</span></span>
              <span className="block break-words text-xs text-muted-foreground">{row.details}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">Review <ArrowRight aria-hidden="true" className="h-4 w-4" /></span>
          </Link>
        </li>)}
      </ul>
    </section>}
    {selectedKey && <ApprovalReview selectedKey={selectedKey} backHref={backHref} leave={leave} correction={correction} region={region} />}
  </>;
}

export async function ApprovalReview({ selectedKey, backHref, leave, correction, overlapScope = leave?.employee, region }: {
  selectedKey: string;
  backHref: string;
  leave?: Prisma.LeaveRequestWhereInput;
  correction?: Prisma.PunchCorrectionWhereInput;
  overlapScope?: Prisma.LeaveRequestWhereInput["employee"];
  region: WorkspaceRegion;
}) {
  const idMatch = /^(leave|correction)\.([a-zA-Z0-9_-]{1,100})$/.exec(selectedKey ?? "");
  const leaveId = idMatch?.[1] === "leave" ? idMatch[2] : undefined;
  const correctionId = idMatch?.[1] === "correction" ? idMatch[2] : undefined;

  const [selectedLeave, selectedCorrection] = await Promise.all([
    leave && leaveId ? prisma.leaveRequest.findFirst({
      where: { AND: [leave, { id: leaveId }] },
      select: {
        ...leaveSummary, tenantId: true, employeeId: true, status: true, reason: true, cancellationReason: true, leavePolicySnapshot: true,
        employee: { select: { ...employeeName, managerId: true, branchId: true } },
      },
    }) : null,
    correction && correctionId ? prisma.punchCorrection.findFirst({
      where: { AND: [correction, { id: correctionId }] },
      select: { ...correctionSummary, tenantId: true, employeeId: true, currentIn: true, currentOut: true, requestedIn: true, requestedOut: true, reason: true },
    }) : null,
  ]);
  const attendance = selectedCorrection ? await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: selectedCorrection.employeeId, date: selectedCorrection.date }, tenantId: selectedCorrection.tenantId },
    select: { punchInTime: true, punchOutTime: true },
  }) : null;
  const resultHref = approvalResultHref(selectedKey, backHref);

  return <>
    {selectedLeave && <ApprovalDrawer key={selectedKey} title={selectedLeave.status === "approved" ? "Review leave cancellation" : "Review leave request"} employee={displayName(selectedLeave.employee)} backHref={backHref} resultHref={resultHref} action={{ kind: "leave", id: selectedLeave.id, cancellation: selectedLeave.status === "approved", cancellationRequestedAt: selectedLeave.cancellationRequestedAt?.toISOString() }}>
      <dl className="space-y-3 text-sm">
        <div><dt className="text-xs font-semibold text-muted-foreground">Leave</dt><dd>{selectedLeave.leaveType.name} · {selectedLeave.days} {selectedLeave.days === 1 ? "day" : "days"}</dd></div>
        <div><dt className="text-xs font-semibold text-muted-foreground">Dates</dt><dd>{rangeLabel(selectedLeave.fromDate, selectedLeave.toDate, region.locale)}</dd></div>
        <div><dt className="text-xs font-semibold text-muted-foreground">{selectedLeave.status === "approved" ? "Cancellation reason" : "Reason"}</dt><dd className="whitespace-pre-wrap break-words">{(selectedLeave.status === "approved" ? selectedLeave.cancellationReason : selectedLeave.reason) || "No reason provided"}</dd></div>
        {selectedLeave.status === "approved" && selectedLeave.reason && <div><dt className="text-xs font-semibold text-muted-foreground">Original leave reason</dt><dd className="whitespace-pre-wrap break-words">{selectedLeave.reason}</dd></div>}
      </dl>
      <LeaveOverlap request={selectedLeave} scope={overlapScope} locale={region.locale} />
    </ApprovalDrawer>}
    {selectedCorrection && <ApprovalDrawer key={selectedKey} title="Review punch correction" employee={displayName(selectedCorrection.employee)} backHref={backHref} resultHref={resultHref} action={{ kind: "correction", id: selectedCorrection.id }}>
      <p className="text-sm"><span className="font-semibold">Attendance date</span> {formatCalendarDate(istDateKey(selectedCorrection.date), region.locale)} <span className="text-muted-foreground">· {region.timeZone}</span></p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <PunchChange label="Check-in" previous={selectedCorrection.currentIn} requested={selectedCorrection.requestedIn} current={attendance?.punchInTime ?? null} region={region} />
        <PunchChange label="Check-out" previous={selectedCorrection.currentOut} requested={selectedCorrection.requestedOut} current={attendance?.punchOutTime ?? null} region={region} />
      </dl>
      <p className="whitespace-pre-wrap break-words text-sm">{selectedCorrection.reason}</p>
    </ApprovalDrawer>}
    {selectedKey && !selectedLeave && !selectedCorrection && <p role="status" className="rounded-lg border border-edge bg-card p-4 text-sm text-muted-foreground">This request is no longer available for review. <Link href={backHref} className="font-medium text-primary underline">Return to the list</Link></p>}
  </>;
}
