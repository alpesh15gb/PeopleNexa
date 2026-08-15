import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LoansPanel } from "./loans-panel";

export const dynamic = "force-dynamic";

export default async function AdminLoansPage() {
  const session = await requireSession();

  const [loans, employees] = await Promise.all([
    prisma.employeeLoan.findMany({
      where: { tenantId: session.tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Loans & Advances" description="Advances and loans are deducted automatically from monthly payslips" />
      <Card>
        <CardContent className="p-0">
          <LoansPanel loans={loans} employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
