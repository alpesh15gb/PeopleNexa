import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { PageHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { TenantDetailPanel } from "./tenant-detail-panel";

export const dynamic = "force-dynamic";

export default async function SuperadminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: { select: { employees: true } },
      modules: { orderBy: { module: "asc" } },
      licenses: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!tenant) notFound();

  const { _count, ...rest } = tenant;
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title={tenant.name}
        description={`${tenant.slug}.peoplenexa.in · ${tenant.code} · ${_count.employees} employees`}
      />
      <TenantDetailPanel
        tenant={{
          ...rest,
          subscriptionExpiry: rest.subscriptionExpiry ? rest.subscriptionExpiry.toISOString() : null,
          createdAt: rest.createdAt.toISOString(),
          employeeCount: _count.employees,
          licenses: rest.licenses.map((l) => ({
            ...l,
            startsAt: l.startsAt.toISOString(),
            expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
            createdAt: l.createdAt.toISOString(),
            createdAtLabel: formatDate(l.createdAt),
            expiresAtLabel: l.expiresAt ? formatDate(l.expiresAt) : null,
          })),
        }}
      />
    </div>
  );
}
