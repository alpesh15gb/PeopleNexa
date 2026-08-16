import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { Wallet, Hourglass, CheckCircle2, Banknote } from "lucide-react";
import { ExpensesPanel } from "./expenses-panel";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage() {
  const session = await requireSession();

  const [claims, pending, approved, settled] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { tenantId: session.tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.expenseClaim.count({ where: { tenantId: session.tenantId, status: "pending" } }),
    prisma.expenseClaim.count({ where: { tenantId: session.tenantId, status: "approved" } }),
    prisma.expenseClaim.count({ where: { tenantId: session.tenantId, status: "settled" } }),
  ]);

  const pendingAmount = claims.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const settledAmount = claims.filter((c) => c.status === "settled").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Expenses & Claims" description="Reimbursement claims from your team" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending" value={pending} sub={`₹${pendingAmount.toLocaleString("en-IN")} awaiting review`} icon={<Hourglass className="h-4.5 w-4.5" />} tone="amber" />
        <StatCard label="Approved" value={approved} icon={<CheckCircle2 className="h-4.5 w-4.5" />} tone="sky" />
        <StatCard label="Settled" value={settled} sub={`₹${settledAmount.toLocaleString("en-IN")} paid out`} icon={<Banknote className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="Total claims" value={claims.length} icon={<Wallet className="h-4.5 w-4.5" />} tone="indigo" />
      </div>
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
    </div>
  );
}
