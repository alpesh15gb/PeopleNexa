import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ExpensesPanel } from "./expenses-panel";

export const dynamic = "force-dynamic";

export default async function EmployeeExpensesPage() {
  const session = await requireSession();
  const lang = await getLang();

  const [claims, summary] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { employeeId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.expenseClaim.groupBy({
      by: ["status"],
      where: { employeeId: session.sub },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const byStatus = new Map(summary.map((s) => [s.status, s]));
  const settledAmount = byStatus.get("settled")?._sum.amount ?? 0;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={t(lang, "expenses.title")}
        description={`${t(lang, "expenses.desc")} · ₹${settledAmount.toLocaleString("en-IN")} ${t(lang, "expenses.settledTotal")}`}
      />
      <Card>
        <CardContent className="p-0">
          <ExpensesPanel
            claims={claims.map((c) => ({
              id: c.id,
              title: c.title,
              category: c.category,
              amount: c.amount,
              description: c.description,
              receiptUrl: c.receiptUrl,
              status: c.status,
              createdAt: c.createdAt.toISOString(),
            }))}
            lang={lang}
          />
        </CardContent>
      </Card>
    </div>
  );
}
