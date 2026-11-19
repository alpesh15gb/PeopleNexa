import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ExpensesPanel } from "./expenses-panel";
import { redirect } from "next/navigation";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPagination, recordPageRedirect, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { expenseSummary } from "@/lib/expense-records";
import { formatRegionalMoney, workspaceRegion } from "@/lib/workspace-region";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmployeeExpensesPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, lang, params] = await Promise.all([requireSession(), getLang(), searchParams]);
  const baseWhere = { tenantId: session.tenantId, employeeId: session.sub };
  const statuses = ["pending", "approved", "settled", "rejected"] as const;
  const status = statuses.find((value) => value === params.status);
  const where = { ...baseWhere, ...(status ? { status } : {}) };

  const [{ total, byStatus }, tenant] = await Promise.all([
    expenseSummary(baseWhere),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const region = workspaceRegion(tenant?.config);
  const path = "/employee/expenses";
  const filteredTotal = status ? byStatus.get(status)?._count._all ?? 0 : total;
  const pagination = recordPagination(filteredTotal, recordPageNumber(params.page) ?? 1);
  const redirectTo = recordPageRedirect(path, params, pagination);
  if (redirectTo) redirect(redirectTo);

  const claims = await prisma.expenseClaim.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
  });

  const settledAmount = byStatus.get("settled")?._sum.amount ?? 0;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "expenses.title")}
        description={t(lang, "expenses.desc")}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3">
        <p className="text-sm font-medium">{formatRegionalMoney(settledAmount, region)} <span className="font-normal text-muted-foreground">{t(lang, "expenses.settledTotal")}</span></p>
        <nav aria-label="Claim status" className="flex flex-wrap gap-1 sm:ml-auto">
          <Link href={path} aria-current={!status ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm hover:bg-tint ${!status ? "bg-tint font-medium" : "text-muted-foreground"}`}>All claims</Link>
          {statuses.map((value) => <Link key={value} href={`${path}?status=${value}`} aria-current={status === value ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm capitalize hover:bg-tint ${status === value ? "bg-tint font-medium" : "text-muted-foreground"}`}>{value} ({byStatus.get(value)?._count._all ?? 0})</Link>)}
        </nav>
      </div>
      <Card>
        <CardContent className="p-0">
          <ExpensesPanel key={`${status ?? "all"}-${pagination.page}`}
            claims={claims.map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              amount: c.amount,
              description: c.description,
              receiptUrl: c.receiptUrl,
              reviewNote: c.reviewNote,
              status: c.status,
              createdAt: c.createdAt.toISOString(),
            }))}
            totalClaims={filteredTotal}
            filtered={Boolean(status)}
            region={region}
            lang={lang}
          />
        </CardContent>
      </Card>
      <DocumentExpensePagination path={path} params={params} pagination={pagination} label="claims" />
    </div>
  );
}
