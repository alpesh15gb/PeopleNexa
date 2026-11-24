import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { managerLocationId, employeeLocationScope } from "@/lib/location-scope";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { SalaryRevisions } from "./salary-changes-workspace";
import { PayrollNavigation } from "@/components/payroll-navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isMonthKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const salaryChangesPath = "/admin/payroll/salary-revisions";

export default async function SalaryRevisionsPage({ searchParams }: {
  searchParams: Promise<{ location?: string | string[]; period?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([requireSession(), searchParams]);
  if (!["admin", "location_manager"].includes(session.role)) return null;
  const isAdmin = session.role === "admin";
  const assignedLocationId = await managerLocationId(session);
  const period = typeof params.period === "string" && isMonthKey(params.period) ? params.period : undefined;
  const locations = await prisma.location.findMany({
    where: { tenantId: session.tenantId, ...(isAdmin ? { isActive: true } : { id: assignedLocationId ?? "" }) },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const requestedLocation = params.location;
  const location = locations.find(({ id }) => id === (isAdmin ? requestedLocation : assignedLocationId));
  const locationId = location?.id;
  const invalidLocation = isAdmin && Boolean(requestedLocation) && !locationId;
  const unavailable = !isAdmin && !locationId;
  const where = {
    tenantId: session.tenantId,
    status: "active",
    loginOnly: false,
    salary: { gt: 0 },
    ...(locationId ? employeeLocationScope(locationId) : {}),
  };
  const [employees, revisions] = unavailable || invalidLocation ? [[], []] : await Promise.all([
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
      description="Schedule salary changes and review requests awaiting approval."
    >
      <div className="mb-5">
        <PayrollNavigation
          active="changes"
          canManageSettings={isAdmin}
          locationId={locationId}
          period={period}
        />
      </div>
      {isAdmin ? (
        <form action={salaryChangesPath} className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-card p-4">
          {period && <input type="hidden" name="period" value={period} />}
          <Field label="Location" className="min-w-44 flex-1">
            <Select name="location" aria-label="Salary changes location" defaultValue={locationId ?? ""}>
              <option value="">All locations</option>
              {locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Button type="submit" variant="outline">View salary changes</Button>
        </form>
      ) : location && <p className="mb-5 text-sm text-muted-foreground">Location <strong className="ml-1 text-foreground">{location.name}</strong></p>}
      {invalidLocation || unavailable ? (
        <p role="status" className="rounded-xl border border-edge bg-card p-4 text-sm">{invalidLocation ? "This location is unavailable. Choose a location above to view salary changes." : "Ask a workspace administrator to assign a location to your account."}</p>
      ) : (
        <SalaryRevisions key={locationId ?? "all"} employees={employees} revisions={revisions} canApprove={isAdmin} currentUserId={session.sub} />
      )}
    </SettingsWorkspace>
  );
}
