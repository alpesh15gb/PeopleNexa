import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { fyFromMonth } from "@/lib/payroll";
import { TaxDeclarationPanel } from "./tax-declaration-panel";

export const dynamic = "force-dynamic";

export default async function EmployeeTaxPage() {
  const session = await requireSession();
  const fy = fyFromMonth(new Date().toISOString().slice(0, 7));
  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { firstName: true, lastName: true, salary: true },
  });
  const declarations = await prisma.taxDeclaration.findMany({
    where: { tenantId: session.tenantId, employeeId: session.sub },
    orderBy: { fy: "desc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Tax declarations"
        description="Declare investments to reduce TDS deducted from your salary"
      />
      <Card>
        <CardContent className="p-6">
          <TaxDeclarationPanel
            currentFy={fy}
            declarations={declarations.map((d) => ({
              id: d.id,
              fy: d.fy,
              sections: (d.sections ?? {}) as Record<string, number>,
              status: d.status,
              note: d.note,
              updatedAt: d.updatedAt.toISOString(),
            }))}
            monthlySalary={employee?.salary ?? 0}
            name={`${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.trim()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
