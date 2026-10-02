import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { fyFromMonth } from "@/lib/payroll";
import { TaxReviewPanel } from "./tax-review-panel";

export const dynamic = "force-dynamic";

export default async function AdminTaxPage() {
  const session = await requireSession();
  if (session.role !== "admin") return null;
  const fy = fyFromMonth(new Date().toISOString().slice(0, 7));
  const [declarations, fys] = await Promise.all([
    prisma.taxDeclaration.findMany({
      where: { tenantId: session.tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
          },
        },
      },
      orderBy: [{ fy: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.taxDeclaration.findMany({
      where: { tenantId: session.tenantId },
      distinct: ["fy"],
      select: { fy: true },
      orderBy: { fy: "desc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Tax declarations"
        description="Review employee declarations and return incomplete details for correction."
      />
      <Card>
        <CardContent className="p-6">
          <TaxReviewPanel
            currentFy={fy}
            declarations={declarations.map((d) => ({
              id: d.id,
              fy: d.fy,
              sections: (d.sections ?? {}) as Record<string, number>,
              status: d.status,
              note: d.note,
              employee: d.employee,
            }))}
            fys={[...new Set([fy, ...fys.map((f) => f.fy)])]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
