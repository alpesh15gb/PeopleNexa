import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LeavesAdmin } from "./leaves-admin";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export const dynamic = "force-dynamic";

export default async function AdminLeavesPage() {
  const session = await requireSession();
  if (!['admin', 'branch_manager', 'location_manager'].includes(session.role)) {
    redirect('/employee/leaves');
  }

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const isLocationManager = session.role === "location_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const locationId = isLocationManager ? await managerLocationId(session) : null;
  const employeeScope = isBranchManager ? ownBranchId ? { branchId: ownBranchId } : { id: "__unassigned_branch__" } : isLocationManager ? locationId ? employeeLocationScope(locationId) : { id: "__unassigned_location__" } : {};

  const [requests, types, employees, importBatches] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { tenantId: session.tenantId, employee: employeeScope },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        leaveType: true,
      },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.leaveType.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: "asc" } }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", ...employeeScope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
      take: 100,
    }),
    session.role === "admin" ? prisma.leaveBalanceImportBatch.findMany({ where: { tenantId: session.tenantId }, include: { leaveType: { select: { name: true, code: true } }, _count: { select: { entries: true } } }, orderBy: { importedAt: "desc" }, take: 10 }) : Promise.resolve([]),
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
          ) : isLocationManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Location-scoped
            </span>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <LeavesAdmin requests={requests} types={types} employees={employees} canManageTypes={session.role === "admin"} importBatches={importBatches} />
        </CardContent>
      </Card>
    </div>
  );
}
