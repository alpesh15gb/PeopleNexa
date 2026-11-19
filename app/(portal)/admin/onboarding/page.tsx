import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingAdmin } from "./onboarding-admin";
import Link from "next/link";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/onboarding");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Onboarding" description="Ask a workspace admin to assign your account to a location." />;
  }
  const scope = locationId ? employeeLocationScope(locationId) : {};
  const [tasks, employees, tenant] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employee: scope },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true } } },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...scope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);
  const region = workspaceRegion(tenant?.config);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Onboarding"
        description="Assign onboarding checklists and track employee progress."
        actions={<Link href="/admin/employee-master" className="rounded-lg border border-edge px-3 py-2 text-sm hover:bg-tint">Employee directory</Link>}
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingAdmin tasks={tasks} employees={employees} today={dateKeyInTimeZone(new Date(), region.timeZone)} />
        </CardContent>
      </Card>
    </div>
  );
}
