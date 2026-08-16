import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingAdmin } from "./onboarding-admin";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  const session = await requireSession();
  const [tasks, employees] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Onboarding"
        description="First-day checklists — documents, accounts, assets and welcome tasks per employee"
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingAdmin tasks={tasks} employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
