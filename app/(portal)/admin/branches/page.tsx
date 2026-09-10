import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { BranchesManager } from "./branches-manager";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  const session = await requireSession();
  const [branches, employees, locations] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: session.tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, role: true, branchId: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.location.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    }),
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
    </div>
  );
}
