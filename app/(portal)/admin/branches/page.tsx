import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { BranchesManager } from "./branches-manager";
import { AutomaticShiftsPanel } from "./automatic-shifts-panel";
import { AUTOMATIC_SHIFT_KIND } from "@/lib/automatic-shifts";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  const session = await requireSession();
  const ownLocationId = session.role === "location_manager"
    ? (await prisma.employee.findUnique({ where: { id: session.sub }, select: { locationId: true } }))?.locationId ?? "__none__"
    : null;
  const [branches, employees, locations, shifts, automaticConfigs] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: session.tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) },
      include: { _count: { select: { employees: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", ...(ownLocationId ? { branch: { locationId: ownLocationId } } : {}) },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, role: true, branchId: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.location.findMany({
      where: { tenantId: session.tenantId, ...(ownLocationId ? { id: ownLocationId } : {}) },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, startTime: true, endTime: true, isNightShift: true }, orderBy: { startTime: "asc" } }),
    prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: AUTOMATIC_SHIFT_KIND, active: true }, select: { scopeKey: true, payload: true } }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Branches"
        description="Manage office branches and their GPS geofences. Assign branches to a location from Locations."
      />
      <Card>
        <CardContent className="p-0">
          {branches.length === 0 ? (
            <EmptyState title="No branches yet" description="Create a branch with a geofence to secure attendance." />
          ) : (
            <BranchesManager branches={branches} employees={employees} locations={locations} />
          )}
        </CardContent>
      </Card>
      {session.role === "admin" && <AutomaticShiftsPanel branches={branches.map((branch) => ({ id: branch.id, name: branch.name, policy: automaticConfigs.find((config) => config.scopeKey === `branch:${branch.id}`)?.payload ?? null }))} shifts={shifts} />}
    </div>
  );
}
