import { canManageDesignations } from "@/lib/designation-access";
import { requireActiveSession } from "@/lib/session";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { DesignationsManager } from "./designations-manager";

export default async function DesignationsPage() {
  const session = await requireActiveSession();
  if (!canManageDesignations(session.role)) {
    return (
      <div className="animate-fade-up space-y-6">
        <PageHeader title="Designation Master" description="Manage the designations available in Employee Master." />
        <Card>
          <CardContent>
            <EmptyState title="Access denied" description="Only tenant Admins and Location Managers can manage designations." />
          </CardContent>
        </Card>
      </div>
    );
  }
  return <DesignationsManager />;
}
