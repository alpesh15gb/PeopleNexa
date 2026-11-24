import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader } from "@/components/ui/card";
import { EmployeeSignIn } from "../employee-master/employee-sign-in";
import { OnboardingAdmin } from "./onboarding-admin";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { getTenantAccess } from "@/lib/modules-server";
import type { OnboardingSignIn } from "@/lib/onboarding-tasks";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/onboarding");
  const [locationId, params] = await Promise.all([managerLocationId(session), searchParams]);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Employee onboarding" description="Ask a workspace admin to assign your account to a location." />;
  }

  const employeeId = typeof params.employee === "string" && params.employee ? params.employee : null;
  const employeeScope = {
    tenantId: session.tenantId,
    ...(locationId ? employeeLocationScope(locationId) : {}),
    ...(employeeId ? { id: employeeId } : {}),
  };
  const [tasks, employees, tenant, access] = await Promise.all([
    prisma.onboardingTask.findMany({
      where: { tenantId: session.tenantId, employee: employeeScope },
      select: {
        id: true, name: true, status: true, dueBy: true, completedAt: true,
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.employee.findMany({
      where: { ...employeeScope, status: "active", loginOnly: false },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, branchId: true, role: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { employeeNumber: "asc" }],
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    getTenantAccess(session.tenantId),
  ]);
  const region = workspaceRegion(tenant?.config);
  const activeEmployee = employeeId ? employees[0] : undefined;
  const focused = employeeId ? activeEmployee ?? tasks[0]?.employee : undefined;
  const fullName = focused ? `${focused.firstName} ${focused.lastName}` : "";
  const directory = access.modules.has("employees");
  const employeeRecord = focused && directory ? `/admin/employee-master?${new URLSearchParams({ employee: focused.id, from: "onboarding" })}` : null;
  const trackedEmployeeIds = new Set(tasks.map((task) => task.employee.id));
  if (activeEmployee) trackedEmployeeIds.add(activeEmployee.id);
  const portalEmployees = directory ? employees.filter((employee) => employee.role === "employee" && trackedEmployeeIds.has(employee.id)) : [];
  const credentials = portalEmployees.length > 0 ? await prisma.employee.findMany({
    where: {
      ...employeeScope,
      status: "active",
      loginOnly: false,
      role: "employee",
      password: { not: null },
      ...(employeeId ? {} : { onboardingTasks: { some: { tenantId: session.tenantId } } }),
    },
    select: { id: true, mustChangePassword: true },
  }) : [];
  const credentialById = new Map(credentials.map((account) => [account.id, account]));
  const signInById: Partial<Record<string, OnboardingSignIn>> = Object.fromEntries(portalEmployees.map(({ id }) => {
    const account = credentialById.get(id);
    return [id, !account ? "missing" : account.mustChangePassword ? "temporary" : "ready"];
  }));
  const signIn = activeEmployee ? signInById[activeEmployee.id] : undefined;
  const canPrepareSignIn = session.role === "admin" && Boolean(activeEmployee?.branchId && activeEmployee.employeeNumber);

  return (
    <div className="space-y-5">
      {employeeId && <Link href="/admin/onboarding" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to onboarding
      </Link>}
      <PageHeader
        title={focused ? `Onboarding · ${fullName}` : "Employee onboarding"}
        description={focused ? `Employee ID ${focused.employeeNumber}${activeEmployee ? "" : " · Checklist history"}` : "Assign first-day tasks and see who still needs to complete them."}
        actions={employeeRecord
          ? <Link href={employeeRecord} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-edge px-4 text-sm font-medium hover:bg-tint">
              Employee record <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          : !employeeId && directory && <Link href="/admin/employee-master?action=create" className="inline-flex min-h-11 items-center rounded-xl border border-edge px-4 text-sm font-medium hover:bg-tint">Add an employee</Link>}
      />
      {employeeId && !focused && (
        <p className="rounded-xl border border-edge bg-card p-5 text-sm text-muted-foreground">This employee is unavailable in your onboarding workspace.</p>
      )}
      {(!employeeId || focused) && (
        <OnboardingAdmin
          key={focused?.id ?? "all"}
          tasks={tasks}
          employees={employees}
          initialEmployeeId={activeEmployee?.id}
          focused={Boolean(focused)}
          signInById={signInById}
          today={dateKeyInTimeZone(new Date(), region.timeZone)}
          locale={region.locale}
        />
      )}
      {signIn && activeEmployee && (
        <section className="flex scroll-mt-24 flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge bg-card p-5" id="employee-sign-in" aria-labelledby="employee-sign-in-heading">
          <div className="space-y-1">
            <h2 id="employee-sign-in-heading" className="text-base font-semibold">Employee sign-in</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {signIn === "temporary" && "A temporary password is set. If HR hasn’t shared the sign-in details yet, share them privately. The employee then sets their own password."}
              {signIn === "ready" && "Sign-in credentials are set. The employee can use their employee ID and password."}
              {signIn === "missing" && (!activeEmployee.branchId || !activeEmployee.employeeNumber
                ? "HR needs to assign a branch and employee ID in the employee record before a workspace admin can issue a temporary password."
                : canPrepareSignIn
                  ? "Issue a temporary password and share the credentials privately with the employee."
                  : "Ask a workspace admin to issue a temporary password and share the credentials privately with the employee.")}
            </p>
          </div>
          {canPrepareSignIn && <EmployeeSignIn employeeId={activeEmployee.id} employeeName={fullName} hasLogin={signIn !== "missing"} />}
        </section>
      )}
    </div>
  );
}
