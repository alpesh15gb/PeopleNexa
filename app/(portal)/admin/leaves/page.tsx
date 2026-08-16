import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LeavesAdmin } from "./leaves-admin";

export const dynamic = "force-dynamic";

export default async function AdminLeavesPage() {
  const session = await requireSession();
  const [requests, types, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        leaveType: true,
      },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Leave management"
        description="Review requests and configure leave policies"
      />
      <Card>
        <CardContent className="p-0">
          <LeavesAdmin requests={requests} types={types} employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
