import { canManageDesignations } from "@/lib/designation-access";
import { requireActiveSession } from "@/lib/session";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { DesignationsManager } from "./designations-manager";
import { prisma } from "@/lib/prisma";

export default async function DesignationsPage() {
  const session = await requireActiveSession();
  if (!canManageDesignations(session.role)) {
    return (
      <div className="animate-fade-up space-y-6">
        <PageHeader title="Designations" description="Manage the job titles available in the employee directory." />
        <Card>
          <CardContent>
            <EmptyState title="Access denied" description="Only tenant Admins and Location Managers can manage designations." />
          </CardContent>
        </Card>
      </div>
    );
  }
  const rows = await prisma.designation.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return <DesignationsManager rows={rows} />;
}
