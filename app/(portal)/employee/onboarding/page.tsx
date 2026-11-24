import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
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
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Get started at work"
        description="Your checklist saves as you go. HR can see which tasks you’ve completed."
      />
      <OnboardingChecklist
        tasks={tasks}
        locale={region.locale}
        today={dateKeyInTimeZone(new Date(), region.timeZone)}
        resources={{
          documents: access.modules.has("documents"),
          policies: access.modules.has("policies"),
          helpdesk: access.modules.has("helpdesk"),
        }}
      />
      <details className="rounded-2xl border border-edge bg-card px-5 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">Onboarding help and resources</summary>
        <p className="mt-3 text-muted-foreground">Contact HR for instructions on documents and signatures, or to check the status of a review.</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <li><Link href="/employee/profile" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">My profile</Link></li>
          {access.modules.has("documents") && <li><Link href="/employee/documents?from=onboarding" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">My documents</Link></li>}
          {access.modules.has("policies") && <li><Link href="/employee/policies" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Company policies</Link></li>}
          {access.modules.has("helpdesk") && <li><Link href="/employee/helpdesk?action=new" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Ask HR for help</Link></li>}
        </ul>
      </details>
    </div>
  );
}
