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
import type { RecordSearchParams } from "@/lib/document-expense-pagination";
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
  const where = reviewOnly ? (await pendingApprovalFilters(session)).leave ?? { id: { in: [] } } : { tenantId: session.tenantId, employee: employeeScope };

  const [requests, types, importBatches, tenant, access] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeNumber: true },
        },
        leaveType: true,
      },
      orderBy: { appliedAt: "desc" },
    }),
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
  ]);
  const cancellationHistory = await leaveCancellationHistory(session.tenantId, requests.filter((request) => request.status === "approved" || request.status === "cancelled").map((request) => request.id));
  const region = workspaceRegion(tenant?.config);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={reviewOnly ? "Pending leave reviews" : "Leave management"}
        description={reviewOnly ? "Review leave applications and cancellation requests assigned to your scope." : "Approve requests, see who's away, and track leave balances."}
        actions={
          reviewOnly ? (
            <Link href="/admin/leaves" className="text-sm font-medium text-primary hover:underline">View all leave requests</Link>
          ) : isBranchManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Branch: {ownBranchName}
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
            canManageTypes={session.role === "admin"}
            canLogLeave={session.role === "admin" || Boolean(ownBranchId || locationId)}
            canViewBalances={session.role === "admin" || Boolean(locationId)}
            canManageHolidays={access?.modules.has("holidays") ?? false}
            importBatches={importBatches}
            reviewOnly={reviewOnly}
            todayKey={dateKeyInTimeZone(new Date(), region.timeZone)}
            locale={region.locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
