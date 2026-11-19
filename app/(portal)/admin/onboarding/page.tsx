import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingAdmin } from "./onboarding-admin";

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
  const [tasks, employees] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employee: scope },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...scope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Onboarding"
        description="Assign onboarding checklists and track employee progress."
      />
      <Card>
        <CardContent className="p-0">
          <OnboardingAdmin tasks={tasks} employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
