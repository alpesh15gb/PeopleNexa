import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingChecklist } from "./onboarding-checklist";

export const dynamic = "force-dynamic";

export default async function EmployeeOnboardingPage() {
  const session = await requireSession();
  const tasks = await prisma.onboardingTask.findMany({
    where: { tenantId: session.tenantId, employeeId: session.sub },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My Onboarding"
        description="Welcome aboard 🎉 — work through your first-day checklist"
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingChecklist tasks={tasks} />
        </CardContent>
      </Card>
    </div>
  );
}
