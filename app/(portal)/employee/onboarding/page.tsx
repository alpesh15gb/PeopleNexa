import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingChecklist } from "./onboarding-checklist";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

export const dynamic = "force-dynamic";

export default async function EmployeeOnboardingPage() {
  const session = await requireSession();
  const [tasks, tenant] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const region = workspaceRegion(tenant?.config);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My onboarding"
        description="Check what is due first and update progress on your onboarding tasks."
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingChecklist tasks={tasks} locale={region.locale} today={dateKeyInTimeZone(new Date(), region.timeZone)} />
        </CardContent>
      </Card>
    </div>
  );
}
