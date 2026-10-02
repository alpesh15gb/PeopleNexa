import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { managerLocationId, employeeLocationScope } from "@/lib/location-scope";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { SalaryRevisions } from "./salary-changes-workspace";
import { PayrollNavigation } from "@/components/payroll-navigation";

export const dynamic = "force-dynamic";

export default async function SalaryRevisionsPage() {
  const session = await requireSession();
  if (!["admin", "location_manager"].includes(session.role)) return null;
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) return null;
  const where = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    ...(locationId ? employeeLocationScope(locationId) : {}),
  };
  const [employees, revisions] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        salary: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.salaryRevision.findMany({
      where: {
        tenantId: session.tenantId,
        ...(locationId ? { employee: employeeLocationScope(locationId) } : {}),
      },
      include: {
        employee: {
          select: { employeeNumber: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  return (
    <SettingsWorkspace
      eyebrow="Pay & people"
      title="Salary changes"
      description="Plan salary changes and track their approval. Previously paid salaries stay unchanged."
    >
      <div className="mb-5">
        <PayrollNavigation
          active="changes"
          canManageSettings={session.role === "admin"}
        />
      </div>
      <SalaryRevisions
        employees={employees}
        revisions={revisions}
        canApprove={session.role === "admin"}
        currentUserId={session.sub}
      />
    </SettingsWorkspace>
  );
}
