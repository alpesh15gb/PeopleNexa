import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { BranchesManager } from "./branches-manager";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  const session = await requireSession();
  const branches = await prisma.branch.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Branches"
        description="Locations with GPS geofencing for verified clock-ins"
      />
      <Card>
        <CardContent className="p-0">
          {branches.length === 0 ? (
            <EmptyState title="No branches yet" description="Create a branch with a geofence to secure attendance." />
          ) : (
            <BranchesManager branches={branches} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
