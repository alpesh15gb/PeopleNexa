import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { PageHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { getEffectivePlans } from "@/lib/plans-server";
import { TenantDetailPanel } from "./tenant-detail-panel";

export const dynamic = "force-dynamic";

export default async function SuperadminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    omit: { config: true },
    include: {
      _count: { select: { employees: true } },
      modules: { orderBy: { module: "asc" } },
      licenses: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!tenant) notFound();

  const { _count, ...rest } = tenant;
  const plans = await getEffectivePlans();
  return (
    <div className="space-y-6">
      <Link href="/superadmin" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline"><ChevronLeft aria-hidden="true" className="size-4" /> Workspace directory</Link>
      <PageHeader
        title={tenant.name}
        description={`${tenant.slug}.${process.env.APP_BASE_DOMAIN ?? "peoplenexa.in"} · ${tenant.code}`}
      />
      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-edge bg-card p-5 sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 text-sm font-semibold capitalize">{tenant.status === "active" && tenant.subscriptionExpiry && tenant.subscriptionExpiry < new Date() ? "Expired" : tenant.status}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Plan</dt><dd className="mt-1 text-sm font-semibold capitalize">{tenant.plan}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Seats in use</dt><dd className="mt-1 text-sm font-semibold">{_count.employees} / {tenant.seats}</dd></div>
        <div><dt className="text-xs text-muted-foreground">License expiry</dt><dd className="mt-1 text-sm font-semibold">{tenant.subscriptionExpiry ? formatDate(tenant.subscriptionExpiry) : "No expiry"}</dd></div>
      </dl>
      <TenantDetailPanel
        plans={plans}
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
