import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { AssetsPanel } from "./assets-panel";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  const session = await requireSession();

  const [assets, employees] = await Promise.all([
    prisma.asset.findMany({
      where: { tenantId: session.tenantId },
      include: {
        assignments: {
          where: { returnedAt: null },
          include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const rows = assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    tag: a.tag,
    serialNumber: a.serialNumber,
    value: a.value,
    purchaseDate: a.purchaseDate,
    status: a.status,
    notes: a.notes,
    assignee: a.assignments[0]?.employee ?? null,
  }));

  const counts = {
    total: assets.length,
    available: assets.filter((a) => a.status === "available").length,
    assigned: assets.filter((a) => a.status === "assigned").length,
    maintenance: assets.filter((a) => a.status === "maintenance").length,
    lost: assets.filter((a) => a.status === "lost").length,
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Asset tracking" description="Manage company assets, assignments and maintenance" />
      <AssetsPanel rows={rows} counts={counts} employees={employees} />
    </div>
  );
}
