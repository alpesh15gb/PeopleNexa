import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { BulkShiftPanel } from "./bulk-shift-panel";
import { BranchesManager } from "./branches-manager";
import { AutomaticShiftsPanel } from "./automatic-shifts-panel";
import { AUTOMATIC_SHIFT_KIND } from "@/lib/automatic-shifts";
import { hasStaffPortalLogin } from "@/lib/branch-manager";

export const dynamic = "force-dynamic";

export default async function AdminBranchesPage() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/admin");
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
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, role: true, branchId: true, loginOnly: true, email: session.role === "admin", password: session.role === "admin" },
      orderBy: { firstName: "asc" },
    }),
    prisma.location.findMany({
      where: { tenantId: session.tenantId, ...(ownLocationId ? { id: ownLocationId } : {}) },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    }),
    session.role === "admin" ? prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, startTime: true, endTime: true, isNightShift: true }, orderBy: { startTime: "asc" } }) : [],
    session.role === "admin" ? prisma.configurationRecord.findMany({ where: { tenantId: session.tenantId, kind: AUTOMATIC_SHIFT_KIND, active: true }, select: { scopeKey: true, payload: true } }) : [],
  ]);
  const staff = employees.map(({ email, password, ...employee }) => ({
    ...employee,
    hasPortalLogin: hasStaffPortalLogin({ email: email ?? null, password: password ?? null }),
  }));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Branches"
        description="Manage office branches and their GPS geofences. Assign branches to a location from Locations."
      />
      <Card>
        <CardContent className="p-0">
          <BranchesManager branches={branches} employees={staff} locations={locations} canCreate={ownLocationId !== "__none__"} canManageAccess={session.role === "admin"} />
        </CardContent>
      </Card>
      {session.role === "admin" && branches.length > 0 && <section className="space-y-4" aria-labelledby="branch-shift-setup">
        <h2 id="branch-shift-setup" className="text-lg font-semibold">Branch shift setup</h2>
        <BulkShiftPanel branches={branches} shifts={shifts} />
        <AutomaticShiftsPanel branches={branches.map((branch) => ({ id: branch.id, name: branch.name, policy: automaticConfigs.find((config) => config.scopeKey === `branch:${branch.id}`)?.payload ?? null }))} shifts={shifts} />
      </section>}
    </div>
  );
}
