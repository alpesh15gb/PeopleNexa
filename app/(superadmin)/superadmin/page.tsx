import { Building2, Users, ShieldAlert, Timer, Sparkles, IndianRupee } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { StatCard } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { getEffectivePlans } from "@/lib/plans-server";
import { TenantsTable } from "./tenants-table";
import { PlansTable } from "./plans-table";

export const dynamic = "force-dynamic";

export default async function SuperadminOverviewPage() {
  await requireSuperAdmin();

  const [stats, tenants] = await Promise.all([
    prisma.$transaction([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "active" } }),
      prisma.tenant.count({ where: { status: "suspended" } }),
      prisma.employee.count(),
      prisma.tenant.count({ where: { plan: "trial" } }),
      prisma.tenant.count({
        where: { subscriptionExpiry: { not: null, lt: new Date(Date.now() + 30 * 24 * 3600 * 1000) } },
      }),
      prisma.tenant.groupBy({
        by: ["plan"],
        _sum: { seats: true },
        _count: { _all: true },
        orderBy: { plan: "asc" },
      }),
    ]),
    prisma.tenant.findMany({
      include: {
        _count: { select: { employees: true } },
        modules: { select: { module: true, enabled: true } },
        licenses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const [total, active, suspended, employees, trials, expiringSoon, seatRows] = stats;

  const plans = await getEffectivePlans();
  const overrides = await prisma.planOverride.findMany({ select: { planKey: true } });
  let mrr = 0;
  let arr = 0;
  const usage: Record<string, { count: number; seats: number }> = {};
  for (const p of plans) {
    const row = seatRows.find((r) => r.plan === p.key) as { _sum?: { seats?: number | null }; _count?: { _all?: number } } | undefined;
    const seats = row?._sum?.seats ?? 0;
    const count = row?._count?._all ?? 0;
    const planMrr = count > 0 ? seats * p.pricePerSeat : 0;
    const planArr = count > 0 ? seats * p.annualPricePerSeat * 12 : 0;
    usage[p.key] = { count, seats };
    mrr += planMrr;
    arr += planArr;
  }
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Platform Overview"
        description="Tenants, licenses and module usage across the platform"
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Tenants" value={total} icon={<Building2 className="h-4.5 w-4.5" />} tone="indigo" />
        <StatCard label="Active" value={active} icon={<Sparkles className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="Suspended" value={suspended} icon={<ShieldAlert className="h-4.5 w-4.5" />} tone="rose" />
        <StatCard label="Trial" value={trials} icon={<Timer className="h-4.5 w-4.5" />} tone="amber" />
        <StatCard label="MRR (est.)" value={inr(mrr)} icon={<IndianRupee className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="ARR (est.)" value={inr(arr)} icon={<IndianRupee className="h-4.5 w-4.5" />} tone="violet" />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">Plans & pricing</h2>
          <p className="text-[12px] text-muted-foreground">Click ✎ on a plan to edit pricing, seats or modules</p>
        </div>
        <PlansTable plans={plans} usage={usage} customized={overrides.map((o) => o.planKey)} />
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold tracking-tight">Tenants</h2>
        <TenantsTable
          plans={plans}
          tenants={tenants.map(({ _count, modules, licenses, ...t }) => ({
            ...t,
            subscriptionExpiry: t.subscriptionExpiry ? t.subscriptionExpiry.toISOString() : null,
            createdAt: t.createdAt.toISOString(),
            employeeCount: _count.employees,
            enabledModules: modules.filter((m) => m.enabled).map((m) => m.module),
            currentLicense: licenses[0] ? { ...licenses[0], startsAt: licenses[0].startsAt.toISOString(), expiresAt: licenses[0].expiresAt ? licenses[0].expiresAt.toISOString() : null, createdAt: licenses[0].createdAt.toISOString() } : null,
            expiryLabel: t.subscriptionExpiry ? formatDate(t.subscriptionExpiry) : null,
            createdAtLabel: formatDate(t.createdAt),
          }))}
        />
      </div>

    </div>
  );
}
