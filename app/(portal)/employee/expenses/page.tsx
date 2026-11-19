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

export const dynamic = "force-dynamic";

export default async function EmployeeExpensesPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, lang, params] = await Promise.all([requireSession(), getLang(), searchParams]);
  const where = { tenantId: session.tenantId, employeeId: session.sub };

  const { total, byStatus } = await expenseSummary(where);
  const path = "/employee/expenses";
  const pagination = recordPagination(total, recordPageNumber(params.page) ?? 1);
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
        description={`${t(lang, "expenses.desc")} · ₹${settledAmount.toLocaleString("en-IN")} ${t(lang, "expenses.settledTotal")}`}
      />
      <Card>
        <CardContent className="p-0">
          <ExpensesPanel key={pagination.page}
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
            totalClaims={total}
            lang={lang}
          />
        </CardContent>
      </Card>
      <DocumentExpensePagination path={path} params={params} pagination={pagination} label="claims" />
    </div>
  );
}
