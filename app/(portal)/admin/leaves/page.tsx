import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { countsAsLeaveDay } from "@/lib/leave-calendar";
import { dayRangeIST, isMonthKey } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requireActiveSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LeavesAdmin } from "./leaves-admin";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { recordPageNumber, recordPagination, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { canReviewLeaveRequest } from "@/lib/leave-lifecycle";
import { leaveCancellationHistory } from "@/lib/leave-request-history";
import { getTenantAccess } from "@/lib/modules-server";

export const dynamic = "force-dynamic";

export default async function AdminLeavesPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (!["admin", "branch_manager", "location_manager"].includes(session.role)) {
    redirect("/employee/leaves");
  }

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({
        where: { id: session.sub },
        select: { branchId: true, branch: { select: { name: true } } },
      })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const locationId = isLocationManager
    ? await managerLocationId(session)
    : null;
  const employeeScope = isBranchManager
    ? ownBranchId
      ? { branchId: ownBranchId }
      : { id: "__unassigned_branch__" }
    : isLocationManager
      ? locationId
        ? employeeLocationScope(locationId)
        : { id: "__unassigned_location__" }
      : {};
  const reviewOnly = params.review === "approvals";
  const canManageTypes = session.role === "admin";
  const canViewBalances = canManageTypes || Boolean(locationId);
  const views = ["requests", "calendar", ...(canViewBalances ? ["balances"] : []), ...(canManageTypes ? ["types", "reconciliation"] : [])];
  const view = !reviewOnly && typeof params.view === "string" && views.includes(params.view) ? params.view : "requests";
  const branch = !isBranchManager && typeof params.branch === "string" && params.branch &&
    (!isLocationManager || locationId) ? await prisma.branch.findFirst({
      where: { id: params.branch, tenantId: session.tenantId, ...(locationId && { locationId }) }, select: { id: true, name: true },
    }) : null;
  const branchFilter = branch ? { employee: { branchId: branch.id } } : {};
  const scope: Prisma.LeaveRequestWhereInput = { tenantId: session.tenantId, employee: { ...employeeScope, ...(branch && { branchId: branch.id }) } };
  const reviewScope: Prisma.LeaveRequestWhereInput = { AND: [(await pendingApprovalFilters(session)).leave ?? { id: { in: [] } }, branchFilter] };
  const status = !reviewOnly && typeof params.status === "string" && ["needs_review", "pending", "approved", "rejected", "cancelled", "cancellation_pending"].includes(params.status) ? params.status : "all";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const where: Prisma.LeaveRequestWhereInput = {
    AND: [
      reviewOnly || status === "needs_review" ? reviewScope : scope,
      status === "cancellation_pending" ? { cancellationRequestedAt: { not: null } } :
        status !== "all" && status !== "needs_review" ? { status } : {},
      ...query.split(/\s+/).filter(Boolean).map((term): Prisma.LeaveRequestWhereInput => ({
        OR: [
          { employee: { firstName: { contains: term, mode: "insensitive" } } },
          { employee: { lastName: { contains: term, mode: "insensitive" } } },
          { employee: { employeeNumber: { contains: term, mode: "insensitive" } } },
          { leaveType: { name: { contains: term, mode: "insensitive" } } },
        ],
      })),
    ],
  };
  const [types, importBatches, tenant, access, requestCount, pending] = await Promise.all([
    prisma.leaveType.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    }),
    session.role === "admin" && !reviewOnly
      ? prisma.leaveBalanceImportBatch.findMany({
          where: { tenantId: session.tenantId },
          include: {
            leaveType: { select: { name: true, code: true } },
            _count: { select: { entries: true } },
          },
          orderBy: { importedAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    session.role === "admin" && !reviewOnly ? getTenantAccess(session.tenantId) : null,
    view === "requests" ? prisma.leaveRequest.count({ where }) : 0,
    prisma.leaveRequest.count({ where: reviewScope }),
  ]);
  const region = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const todayBounds = dayRangeIST(today);
  const month = typeof params.month === "string" && isMonthKey(params.month) && params.month >= "1900-01" && params.month < "9999-12" ? params.month : today.slice(0, 7);
  const monthStart = dayRangeIST(`${month}-01`).start;
  const nextMonth = new Date(`${month}-01T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = dayRangeIST(nextMonth.toISOString().slice(0, 10)).start;
  const pagination = recordPagination(requestCount, recordPageNumber(params.page) ?? 1, 30);
  const [requests, currentLeave, upcoming] = await Promise.all([
    view === "requests" || view === "calendar" ? prisma.leaveRequest.findMany({
      where: view === "requests" ? where : { ...scope, status: "approved", fromDate: { lt: monthEnd }, toDate: { gte: monthStart } },
      include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, leaveType: true },
      orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
      ...(view === "requests" && { skip: pagination.offset, take: pagination.pageSize }),
    }) : [],
    !reviewOnly ? prisma.leaveRequest.findMany({
      where: { ...scope, status: "approved", fromDate: { lt: todayBounds.end }, toDate: { gte: todayBounds.start } },
      select: { employeeId: true, leavePolicySnapshot: true },
    }) : [],
    !reviewOnly ? prisma.leaveRequest.count({ where: { ...scope, status: "approved", fromDate: { gte: todayBounds.end } } }) : 0,
  ]);
  const awayToday = new Set(currentLeave.filter((request) => countsAsLeaveDay(request.leavePolicySnapshot, today)).map((request) => request.employeeId)).size;
  const cancellationHistory = view === "requests" ? await leaveCancellationHistory(session.tenantId, requests.filter((request) => request.status === "approved" || request.status === "cancelled").map((request) => request.id)) : new Map();

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={reviewOnly ? "Pending leave reviews" : "Leave management"}
        description={reviewOnly ? "Review leave applications and cancellation requests assigned to your scope." : "Approve requests, see who's away, and track leave balances."}
        actions={
          reviewOnly ? (
            <Link href={branch ? `/admin/leaves?branch=${encodeURIComponent(branch.id)}` : "/admin/leaves"} className="text-sm font-medium text-primary hover:underline">View all leave requests</Link>
          ) : branch || isBranchManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Branch: {branch?.name ?? ownBranchName}
            </span>
          ) : isLocationManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Location-scoped
            </span>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <LeavesAdmin
            requests={requests.map((request) => ({
              ...request,
              canReview: canReviewLeaveRequest(request, session.sub) && request.cancellationRequestedBy !== session.sub,
              cancellationDecision: cancellationHistory.get(request.id),
            }))}
            types={types}
            canManageTypes={canManageTypes}
            canLogLeave={session.role === "admin" || Boolean(ownBranchId || locationId)}
            canViewBalances={canViewBalances}
            canManageHolidays={access?.modules.has("holidays") ?? false}
            importBatches={importBatches}
            reviewOnly={reviewOnly}
            todayKey={today}
            monthKey={month}
            branch={branch?.id ?? ""}
            tab={view as "requests" | "balances" | "types" | "calendar" | "reconciliation"}
            query={query}
            statusFilter={reviewOnly ? "pending" : status}
            pending={pending}
            awayToday={awayToday}
            upcoming={upcoming}
            resultCount={requestCount}
            locale={region.locale}
          />
        </CardContent>
      </Card>
      {view === "requests" && <DocumentExpensePagination path="/admin/leaves" params={{ view, status: status !== "all" ? status : undefined, q: query || undefined, branch: branch?.id, review: reviewOnly ? "approvals" : undefined }} pagination={pagination} label="leave requests" />}
    </div>
  );
}
