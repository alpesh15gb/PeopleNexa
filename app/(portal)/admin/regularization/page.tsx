import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "../attendance/date-picker";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, isDateKey } from "@/lib/dates";
import { employeeLocationScope } from "@/lib/location-scope";
import { workspaceRegion } from "@/lib/workspace-region";
import { formatCalendarDate, timeZoneDayRange } from "@/lib/workspace-time";
import { recordPageNumber, recordPagination, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { RegularizationPanel } from "./regularization-panel";
import { ApprovalReview, approvalItemHref } from "../approvals/priority-approvals";
import { ApprovalReceipt } from "../approvals/approval-receipt";
import { payrollReviewReturn } from "@/lib/payroll-review-links";

export const dynamic = "force-dynamic";

export default async function AdminRegularizationPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee/attendance");
  const { tenantId, role } = session;
  const payrollReturn = ["admin", "location_manager"].includes(role) ? payrollReviewReturn(params) : null;
  const manager = role === "branch_manager" || role === "location_manager"
    ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId }, select: { branchId: true, locationId: true } })
    : null;
  const managerScope = role === "branch_manager" ? { branchId: manager?.branchId ?? "__unassigned__" } :
    role === "location_manager" ? employeeLocationScope(manager?.locationId ?? "__unassigned__") : {};
  const branch = role !== "branch_manager" && typeof params.branch === "string" && params.branch
    ? await prisma.branch.findFirst({ where: { id: params.branch, tenantId, ...(role === "location_manager" && { locationId: manager?.locationId ?? "__unassigned__" }) }, select: { id: true, name: true } })
    : null;
  const employeeScope = { ...managerScope, ...(branch && { branchId: branch.id }) };
  const correctionScope = role === "location_manager" ? { ...(branch && { branchId: branch.id }), branch: { locationId: manager?.locationId ?? "__unassigned__" } } : employeeScope;
  const reviewOnly = params.review === "approvals";
  const view = params.view === "punches" && !reviewOnly ? "punches" : "corrections";
  const reviewed = params.status === "reviewed" && !reviewOnly && view === "corrections";
  const date = typeof params.date === "string" && isDateKey(params.date) ? params.date : "";
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const region = workspaceRegion(tenant?.config);
  const correctionDay = date ? dayRangeIST(date) : null;
  const punchDay = date ? timeZoneDayRange(date, region.timeZone) : null;

  function href(section: string, status?: string, filterDate = date) {
    const query = new URLSearchParams({ ...payrollReturn?.params, view: section });
    if (status) query.set("status", status);
    if (filterDate) query.set("date", filterDate);
    if (branch) query.set("branch", branch.id);
    return `/admin/regularization?${query}`;
  }
  const attendanceParams = new URLSearchParams();
  if (date) attendanceParams.set("date", date);
  if (branch) attendanceParams.set("branch", branch.id);
  const attendanceHref = attendanceParams.size ? `/admin/attendance?${attendanceParams}` : "/admin/attendance";
  const employeeDetails = { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } as const;
  const correctionWhere: Prisma.PunchCorrectionWhereInput = {
    tenantId, employee: correctionScope, ...(reviewed ? { status: { in: ["approved", "rejected"] } } : { status: "pending", employeeId: { not: session.sub } }),
    ...(correctionDay && { date: { gte: correctionDay.start, lt: correctionDay.end } }),
  };
  const punchWhere: Prisma.PunchWhereInput = {
    tenantId, employee: employeeScope, employeeId: { not: session.sub },
    OR: [{ faceStatus: { in: ["review", "rejected"] } }, { authStatus: "pending" }],
    ...(punchDay && { punchTime: { gte: punchDay.start, lt: punchDay.end } }),
  };
  const total = view === "corrections" ? await prisma.punchCorrection.count({ where: correctionWhere }) : await prisma.punch.count({ where: punchWhere });
  const pagination = recordPagination(total, recordPageNumber(params.page) ?? 1, 25);
  const listParams = { ...payrollReturn?.params, view, status: reviewed ? "reviewed" : undefined, date: date || undefined, branch: branch?.id, review: reviewOnly ? "approvals" : undefined };
  const reviewParams = new URLSearchParams();
  for (const [key, value] of Object.entries(listParams)) if (value) reviewParams.set(key, value);
  if (pagination.page > 1) reviewParams.set("page", String(pagination.page));
  const backHref = `/admin/regularization?${reviewParams}`;
  const selectedKey = view === "corrections" && !reviewed && typeof params.item === "string" ? params.item : "";
  const corrections = view === "corrections" ? await prisma.punchCorrection.findMany({
    where: correctionWhere,
    include: { employee: employeeDetails },
    orderBy: reviewed ? [{ reviewedAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  }) : [];
  const faceReviews = view === "punches" ? await prisma.punch.findMany({
    where: punchWhere,
    select: {
      id: true, punchTime: true, faceStatus: true, inOutHint: true, locationAccuracy: true,
      locationStatus: true, faceScore: true, lat: true, lng: true, authStatus: true, holdReason: true,
      employee: employeeDetails,
    },
    orderBy: [{ punchTime: "asc" }, { id: "asc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  }) : [];
  const photoIds = new Set(faceReviews.length ? (await prisma.punch.findMany({
    where: { tenantId, id: { in: faceReviews.map((punch) => punch.id) }, selfie: { not: null } }, select: { id: true },
  })).map(({ id }) => id) : []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance review"
        description={date ? `${formatCalendarDate(date, region.locale)}${branch ? ` · ${branch.name}` : ""} · ${region.timeZone}` : undefined}
        actions={<Link href={payrollReturn?.href ?? attendanceHref} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">{payrollReturn ? "Back to payroll" : "Back to daily attendance"}</Link>}
      />
      {typeof params.result === "string" && <ApprovalReceipt result={params.result} tenantId={tenantId} actorId={session.sub} backHref={backHref} region={region} correctionScope={{ ...correctionWhere, status: { in: ["approved", "rejected"] } }} />}
      {reviewOnly ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-primary">
        <Link className="inline-flex min-h-10 items-center hover:underline" href="/admin/approvals">Approvals inbox</Link>
        <Link className="inline-flex min-h-10 items-center hover:underline" href={href("corrections")}>Open attendance review workspace</Link>
      </div> :
        <nav className="flex flex-wrap gap-x-5 border-b border-edge text-sm" aria-label="Attendance review views">
          {[
            { label: "Pending corrections", href: href("corrections"), active: view === "corrections" && !reviewed },
            { label: "Held punches", href: href("punches"), active: view === "punches" },
            { label: "Reviewed corrections", href: href("corrections", "reviewed"), active: reviewed },
          ].map((tab) => <Link key={tab.label} href={tab.href} aria-current={tab.active ? "page" : undefined} className={`border-b-2 px-1 py-3 font-medium ${tab.active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}</Link>)}
        </nav>}
      <div className="flex flex-wrap items-center gap-3">
        <DatePicker value={date} label={view === "punches" ? "Punch date" : "Work date"} />
        {date && <Link href={href(view, reviewed ? "reviewed" : undefined, "")} className="text-sm font-medium text-primary hover:underline">Clear date</Link>}
      </div>
      <Card><CardContent className="p-0">
        <RegularizationPanel
          region={region}
          view={view}
          reviewed={reviewed}
          corrections={corrections.map((correction) => ({
            id: correction.id, date: correction.date.toISOString(), currentIn: correction.currentIn?.toISOString() ?? null,
            currentOut: correction.currentOut?.toISOString() ?? null, requestedIn: correction.requestedIn?.toISOString() ?? null,
            requestedOut: correction.requestedOut?.toISOString() ?? null, reason: correction.reason, status: correction.status,
            reviewNote: correction.reviewNote, createdAt: correction.createdAt.toISOString(), employee: correction.employee,
            reviewHref: approvalItemHref(`correction.${correction.id}`, backHref),
          }))}
          faceReviews={faceReviews.map((punch) => ({
            ...punch, punchTime: punch.punchTime.toISOString(),
            selfie: photoIds.has(punch.id) ? `/api/reports/mobile-punches?photo=${encodeURIComponent(punch.id)}` : null,
          }))}
        />
      </CardContent></Card>
      <DocumentExpensePagination path="/admin/regularization" params={listParams} pagination={pagination} label={view === "corrections" ? "corrections" : "punches"} />
      {selectedKey && <ApprovalReview selectedKey={selectedKey} backHref={backHref} correction={correctionWhere} region={region} />}
    </div>
  );
}
