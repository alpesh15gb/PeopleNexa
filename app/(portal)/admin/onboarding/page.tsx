import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OnboardingAdmin } from "./onboarding-admin";
import Link from "next/link";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { getTenantAccess } from "@/lib/modules-server";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/onboarding");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Onboarding" description="Ask a workspace admin to assign your account to a location." />;
  }
  const scope = locationId ? employeeLocationScope(locationId) : {};
  const [tasks, employees, tenant, params, access] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employee: scope },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true } } },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...scope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, joiningDate: true, branchId: true, role: true },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    searchParams,
    getTenantAccess(session.tenantId),
  ]);
  const region = workspaceRegion(tenant?.config);
  const employeeId = typeof params.employee === "string" ? params.employee : null;
  const activeEmployee = employees.find((employee) => employee.id === employeeId);
  const focused = activeEmployee ?? tasks.find((task) => task.employee.id === employeeId)?.employee;
  const directory = access.modules.has("employees");
  const employeeRecord = focused ? `/admin/employee-master?employee=${encodeURIComponent(focused.id)}` : null;
  const canPrepareSignIn = session.role === "admin" && activeEmployee?.role === "employee" && Boolean(activeEmployee.branchId);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Onboarding"
        description="Assign onboarding checklists and track employee progress."
        actions={focused ? <Link href="/admin/onboarding" className="rounded-lg border border-edge px-3 py-2 text-sm hover:bg-tint">All onboarding</Link> : directory && <Link href="/admin/employee-master?action=create" className="rounded-lg border border-edge px-3 py-2 text-sm hover:bg-tint">Add employee</Link>}
      />
      {employeeId && !focused && <p className="rounded-lg border border-edge bg-card p-4 text-sm text-muted-foreground">This employee is unavailable in your onboarding workspace.</p>}
      {focused ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-card p-4">
        <div><h2 className="font-semibold">{focused.firstName} {focused.lastName}</h2><p className="text-sm text-muted-foreground">{focused.employeeNumber}{!activeEmployee && " · Checklist history only"}</p></div>
        {directory && employeeRecord && <div className="flex flex-wrap gap-3">
          {canPrepareSignIn && <Link href={`${employeeRecord}&action=sign-in`} className="text-sm font-medium text-primary hover:underline">Set up sign-in</Link>}
          <Link href={employeeRecord} className="text-sm font-medium text-primary hover:underline">Open employee record</Link>
        </div>}
      </div> : <ol className="grid gap-3 sm:grid-cols-3" aria-label="Onboarding workflow">
        <li className="rounded-xl border border-edge bg-card p-4"><h2 className="text-sm font-semibold">Create the employee</h2><p className="mt-1 text-sm text-muted-foreground">Add their work details in the directory.</p></li>
        <li className="rounded-xl border border-edge bg-card p-4"><h2 className="text-sm font-semibold">Prepare sign-in</h2><p className="mt-1 text-sm text-muted-foreground">A workspace admin can issue a temporary password from the employee record.</p></li>
        <li className="rounded-xl border border-edge bg-card p-4"><h2 className="text-sm font-semibold">Assign the checklist</h2><p className="mt-1 text-sm text-muted-foreground">Employees mark tasks complete. HR can track progress here.</p></li>
      </ol>}
      {(!employeeId || focused) && <Card>
        <CardContent className="p-0">
          <OnboardingAdmin key={focused?.id ?? "all"} tasks={focused ? tasks.filter((task) => task.employee.id === focused.id) : tasks} employees={focused ? employees.filter((employee) => employee.id === focused.id) : employees} initialEmployeeId={activeEmployee?.id} today={dateKeyInTimeZone(new Date(), region.timeZone)} />
        </CardContent>
      </Card>}
    </div>
  );
}
