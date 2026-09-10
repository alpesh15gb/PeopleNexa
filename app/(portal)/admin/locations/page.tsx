import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { LocationsManager } from "./locations-manager";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const session = await requireSession();
  const [locations, branches] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: session.tenantId },
      include: {
        branches: { select: { id: true, name: true, code: true }, orderBy: { name: "asc" } },
        managers: { where: { loginOnly: true, role: "location_manager", status: "active" }, select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, code: true, locationId: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Locations" description="Group branches by location and grant up to four scoped manager logins per location." />
      <Card><CardContent className="p-0"><LocationsManager locations={locations} branches={branches} /></CardContent></Card>
    </div>
  );
}
