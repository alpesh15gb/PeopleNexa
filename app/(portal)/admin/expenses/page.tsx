import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ExpensesPanel } from "./expenses-panel";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { expenseSummary } from "@/lib/expense-records";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import { getTenantAccess } from "@/lib/modules-server";
import { formatRegionalMoney, supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/expenses");
  const locationId = await managerLocationId(session);
  const reviewOnly = params.review === "approvals";
  const statusFilter = !reviewOnly && typeof params.status === "string" && ["pending", "approved", "settled", "rejected"].includes(params.status) ? params.status : null;
  const where = reviewOnly ? (await pendingApprovalFilters(session)).expense ?? { id: { in: [] } } : {
    tenantId: session.tenantId,
    ...(session.role === "location_manager" ? { employee: employeeLocationScope(locationId ?? "__unassigned_location__") } : {}),
  };

  const [{ total: totalClaims, byStatus }, tenant, access] = await Promise.all([
    expenseSummary(where),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } }),
    getTenantAccess(session.tenantId),
  ]);
  const region = workspaceRegion(tenant.config);
  const path = "/admin/expenses";
  const pagination = recordPagination(statusFilter ? byStatus.get(statusFilter)?._count._all ?? 0 : totalClaims, recordPageNumber(params.page) ?? 1);
  const redirectTo = recordPageRedirect(path, params, pagination);
  if (redirectTo) redirect(redirectTo);

  const claims = await prisma.expenseClaim.findMany({
    where: { ...where, ...(statusFilter ? { status: statusFilter } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  });

  const pending = byStatus.get("pending");
  const settled = byStatus.get("settled");

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={reviewOnly ? "Pending expense claims" : "Team expenses"}
        description="Reimbursement claims from your team"
        actions={reviewOnly && <Link href={path} className="text-sm font-medium text-primary hover:underline">View all claims</Link>}
      />
      <section aria-label="Expense status" className="rounded-xl border border-edge bg-card">
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <p><strong className="tabular-nums">{formatRegionalMoney(pending?._sum.amount ?? 0, region)}</strong> <span className="text-muted-foreground">awaiting review</span></p>
          {!reviewOnly && <p><strong className="tabular-nums">{formatRegionalMoney(settled?._sum.amount ?? 0, region)}</strong> <span className="text-muted-foreground">settled</span></p>}
        </div>
        {!reviewOnly && <nav aria-label="Claim statuses" className="flex flex-wrap gap-1 border-t border-edge px-3 py-2">
          {[["", "All claims"], ["pending", "Pending review"], ["approved", "Approved"], ["settled", "Settled"], ["rejected", "Rejected"]].map(([value, label]) => (
            <Link key={value} href={value ? `${path}?status=${value}` : path} aria-current={(statusFilter ?? "") === value ? "page" : undefined}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-tint aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary">
              {label}<span className="text-xs tabular-nums text-muted-foreground">{value ? byStatus.get(value)?._count._all ?? 0 : totalClaims}</span>
            </Link>
          ))}
        </nav>}
      </section>
      <Card>
        <CardContent className="p-0">
          <ExpensesPanel key={`${statusFilter}:${pagination.page}`}
            emptyTitle={reviewOnly ? "No claims awaiting review" : statusFilter ? "No claims in this status" : undefined}
            actorId={session.sub}
            canUsePayroll={access.modules.has("payroll") && supportsIndiaPayroll(region)}
            region={region}
            claims={claims.map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              amount: c.amount,
              description: c.description,
              receiptUrl: c.receiptUrl,
              status: c.status,
              reviewNote: c.reviewNote,
              createdAt: c.createdAt.toISOString(),
              employee: {
                id: c.employee.id,
                firstName: c.employee.firstName,
                lastName: c.employee.lastName,
                employeeNumber: c.employee.employeeNumber,
              },
            }))}
          />
        </CardContent>
      </Card>
      <DocumentExpensePagination path={path} params={params} pagination={pagination} label="claims" />
    </div>
  );
}
