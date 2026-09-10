import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LeavesAdmin } from "./leaves-admin";

export const dynamic = "force-dynamic";

export default async function AdminLeavesPage() {
  const session = await requireSession();

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const branchId = isBranchManager ? ownBranchId : null;
  const locationId = isLocationManager ? (await prisma.employee.findUnique({ where: { id: session.sub }, select: { locationId: true } }))?.locationId ?? null : null;

  const [requests, types, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, ...(branchId ? { employee: { branchId } } : locationId ? { employee: { branch: { locationId } } } : {}) },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        leaveType: true,
      },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", ...(branchId ? { branchId } : locationId ? { branch: { locationId } } : {}) },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Leave management"
        description="Review requests and configure leave policies"
        actions={
          isBranchManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Branch: {ownBranchName}
            </span>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <LeavesAdmin requests={requests} types={types} employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
