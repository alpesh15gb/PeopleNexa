import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { RegularizationPanel } from "./regularization-panel";

export const dynamic = "force-dynamic";

export default async function AdminRegularizationPage() {
  const session = await requireSession();

  const corrections = await prisma.punchCorrection.findMany({
    where: { tenantId: session.tenantId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pending = corrections.filter((c) => c.status === "pending").length;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Punch Regularization"
        description={`${pending} pending request${pending === 1 ? "" : "s"} · approve or reject employee-requested corrections`}
      />
      <Card>
        <CardContent className="p-0">
          <RegularizationPanel
            corrections={corrections.map((c) => ({
              id: c.id,
              date: c.date.toISOString(),
              currentIn: c.currentIn?.toISOString() ?? null,
              currentOut: c.currentOut?.toISOString() ?? null,
              requestedIn: c.requestedIn?.toISOString() ?? null,
              requestedOut: c.requestedOut?.toISOString() ?? null,
              reason: c.reason,
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
