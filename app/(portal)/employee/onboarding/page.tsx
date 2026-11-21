import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingChecklist } from "./onboarding-checklist";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { getTenantAccess } from "@/lib/modules-server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmployeeOnboardingPage() {
  const session = await requireSession();
  const [tasks, tenant, access] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employeeId: session.sub },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    getTenantAccess(session.tenantId),
  ]);
  const region = workspaceRegion(tenant?.config);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="My onboarding"
        description="Work through the tasks HR assigned and mark each one complete."
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingChecklist tasks={tasks} locale={region.locale} today={dateKeyInTimeZone(new Date(), region.timeZone)} />
        </CardContent>
      </Card>
      <section aria-labelledby="onboarding-resources" className="space-y-3">
        <h2 id="onboarding-resources" className="text-base font-semibold">Resources for your checklist</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/employee/profile" className="rounded-xl border border-edge bg-card p-4 text-sm font-medium hover:border-primary/40">Review your recorded contact and work details</Link>
          {access.modules.has("documents") && <Link href="/employee/documents" className="rounded-xl border border-edge bg-card p-4 text-sm font-medium hover:border-primary/40">Open documents shared with you</Link>}
          {access.modules.has("policies") && <Link href="/employee/policies" className="rounded-xl border border-edge bg-card p-4 text-sm font-medium hover:border-primary/40">Read company policies</Link>}
        </div>
        <p className="text-sm text-muted-foreground">Ask HR how to submit documents that need verification or signatures. {access.modules.has("helpdesk") && <Link className="font-medium text-primary hover:underline" href="/employee/helpdesk?action=new">Ask HR for help</Link>}</p>
      </section>
    </div>
  );
}
