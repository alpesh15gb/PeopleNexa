import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { DepartmentsManager } from "./departments-manager";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  const session = await requireSession();
  const departments = await prisma.department.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Departments"
        description="Organize employees into teams"
      />
      <Card>
        <CardContent className="p-0">
          {departments.length === 0 ? (
            <EmptyState title="No departments yet" description="Create your first department to organize your team." />
          ) : (
            <DepartmentsManager departments={departments} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
