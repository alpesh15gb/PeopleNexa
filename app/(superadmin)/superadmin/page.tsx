import { Building2, Users, ShieldAlert, Timer, Sparkles, IndianRupee } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { StatCard } from "@/components/ui/stat";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PLANS } from "@/lib/modules";
import { TenantsTable } from "./tenants-table";

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

  let mrr = 0;
  let arr = 0;
  const revenueByPlan = PLANS.map((p) => {
    const row = seatRows.find((r) => r.plan === p.key) as { _sum?: { seats?: number | null }; _count?: { _all?: number } } | undefined;
    const seats = row?._sum?.seats ?? 0;
    const count = row?._count?._all ?? 0;
    const planMrr = count > 0 ? seats * p.pricePerSeat : 0;
    const planArr = count > 0 ? seats * p.annualPricePerSeat * 12 : 0;
    mrr += planMrr;
    arr += planArr;
    return { plan: p, count, seats, mrr: planMrr, arr: planArr };
  });
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
        <h2 className="mb-3 font-display text-lg font-bold tracking-tight">Plans & pricing</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-edge text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Price / seat</th>
                    <th className="px-3 py-3 font-medium">Annual / seat</th>
                    <th className="px-3 py-3 font-medium">Trial days</th>
                    <th className="px-3 py-3 font-medium">Tenants</th>
                    <th className="px-3 py-3 font-medium">Licensed seats</th>
                    <th className="px-3 py-3 font-medium text-right">MRR</th>
                    <th className="px-3 py-3 font-medium text-right">ARR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {revenueByPlan.map(({ plan, count, seats, mrr: pm, arr: pa }) => (
                    <tr key={plan.key} className="transition-colors hover:bg-tint/40">
                      <td className="px-5 py-3 font-medium capitalize">{plan.label}</td>
                      <td className="px-3 py-3 text-muted-foreground">{plan.pricePerSeat > 0 ? `₹${plan.pricePerSeat}` : plan.key === "enterprise" ? "Custom" : "Free"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{plan.annualPricePerSeat > 0 ? `₹${plan.annualPricePerSeat}` : "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{plan.trialDays > 0 ? `${plan.trialDays}` : "—"}</td>
                      <td className="px-3 py-3">{count}</td>
                      <td className="px-3 py-3">{seats.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-300">{inr(pm)}</td>
                      <td className="px-3 py-3 text-right font-mono text-violet-300">{inr(pa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold tracking-tight">Tenants</h2>
        <TenantsTable
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
