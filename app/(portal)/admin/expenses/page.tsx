import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Wallet, Hourglass, CheckCircle2, Banknote } from "lucide-react";
import { ExpensesPanel } from "./expenses-panel";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { expenseSummary } from "@/lib/expense-records";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import { supportsIndiaPayroll, workspaceRegion } from "@/lib/workspace-region";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession(), searchParams]);
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/expenses");
  const locationId = await managerLocationId(session);
  const reviewOnly = params.review === "approvals";
  const where = reviewOnly ? (await pendingApprovalFilters(session)).expense ?? { id: { in: [] } } : {
    tenantId: session.tenantId,
    ...(session.role === "location_manager" ? { employee: employeeLocationScope(locationId ?? "__unassigned_location__") } : {}),
  };

  const [{ total: totalClaims, byStatus }, tenant] = await Promise.all([
    expenseSummary(where),
    prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const path = "/admin/expenses";
  const pagination = recordPagination(totalClaims, recordPageNumber(params.page) ?? 1);
  const redirectTo = recordPageRedirect(path, params, pagination);
  if (redirectTo) redirect(redirectTo);

  const claims = await prisma.expenseClaim.findMany({
    where,
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  });

  const pending = byStatus.get("pending");
  const approved = byStatus.get("approved");
  const settled = byStatus.get("settled");

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={reviewOnly ? "Pending expense claims" : "Expenses & Claims"}
        description="Reimbursement claims from your team"
        actions={reviewOnly && <Link href={path} className="text-sm font-medium text-primary hover:underline">View all claims</Link>}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending" value={pending?._count._all ?? 0} sub={`₹${(pending?._sum.amount ?? 0).toLocaleString("en-IN")} awaiting review`} icon={<Hourglass className="h-4.5 w-4.5" />} tone="amber" />
        {!reviewOnly && <>
        <StatCard label="Approved" value={approved?._count._all ?? 0} icon={<CheckCircle2 className="h-4.5 w-4.5" />} tone="sky" />
        <StatCard label="Settled" value={settled?._count._all ?? 0} sub={`₹${(settled?._sum.amount ?? 0).toLocaleString("en-IN")} marked settled`} icon={<Banknote className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="Total claims" value={totalClaims} icon={<Wallet className="h-4.5 w-4.5" />} tone="indigo" />
        </>}
      </div>
      <Card>
        <CardContent className="p-0">
          <ExpensesPanel key={pagination.page}
            actorId={session.sub}
            canUsePayroll={supportsIndiaPayroll(workspaceRegion(tenant.config))}
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
