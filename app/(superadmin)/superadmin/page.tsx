import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldAlert, Timer, CheckCircle2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/superadmin";
import { StatCard } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentExpensePagination } from "@/components/document-expense-pagination";
import { recordPageNumber, recordPageRedirect, recordPagination, type RecordSearchParams } from "@/lib/document-expense-pagination";
import { formatDate } from "@/lib/dates";
import { getEffectivePlans } from "@/lib/plans-server";
import { TenantsTable } from "./tenants-table";
import { PlansTable } from "./plans-table";

export const dynamic = "force-dynamic";

export default async function SuperadminOverviewPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const plansView = params.view === "plans";
  const now = new Date();
  const expiringWhere = { status: "active", subscriptionExpiry: { lt: new Date(now.getTime() + 30 * 86_400_000) } };
  const activeWhere: Prisma.TenantWhereInput = { status: "active", OR: [{ subscriptionExpiry: null }, { subscriptionExpiry: { gte: now } }] };

  const [total, active, suspended, renewal, plans] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: activeWhere }),
    prisma.tenant.count({ where: { status: "suspended" } }),
    prisma.tenant.count({ where: expiringWhere }),
    getEffectivePlans(),
  ]);

  const section = plansView
    ? await planPricingSection(plans)
    : await workspaceDirectorySection({ params, plans, now, activeWhere, expiringWhere });
  return (
    <div className="space-y-6">
      <PageHeader title={plansView ? "Plans & pricing" : "Customer workspaces"}
        description={plansView ? "Set the default pricing, seat limits, and included services for each plan." : "Manage workspace access and subscription renewals."} />
      <nav aria-label="Platform sections" className="flex flex-wrap gap-2 border-b border-edge pb-3">
        {[{ href: "/superadmin", label: "Workspaces", selected: !plansView }, { href: "/superadmin?view=plans", label: "Plans & pricing", selected: plansView }].map(({ href, label, selected }) => (
          <Link key={href} href={href} aria-current={selected ? "page" : undefined} className={`rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-tint ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{label}</Link>
        ))}
      </nav>
      {!plansView && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Workspaces" value={total} icon={<Building2 className="size-4" />} tone="indigo" />
        <StatCard label="Active access" value={active} icon={<CheckCircle2 className="size-4" />} tone="emerald" />
        <StatCard label="Suspended" value={suspended} icon={<ShieldAlert className="size-4" />} tone="rose" />
        <Link href="/superadmin?status=renewal" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatCard className="h-full hover:bg-tint" label="Needs renewal" value={renewal} icon={<Timer className="size-4" />} tone="amber" />
        </Link>
      </div>
      )}
      {section}
    </div>
  );
}

type Plans = Awaited<ReturnType<typeof getEffectivePlans>>;

async function planPricingSection(plans: Plans) {
  const [overrides, seatRows] = await Promise.all([
    prisma.planOverride.findMany({ select: { planKey: true } }),
    prisma.tenant.groupBy({ by: ["plan"], _sum: { seats: true }, _count: { _all: true }, orderBy: { plan: "asc" } }),
  ]);
  const usage = Object.fromEntries(seatRows.map((row) => [row.plan, { count: row._count._all, seats: row._sum.seats ?? 0 }]));
  return (
    <section aria-label="Plans and pricing" className="space-y-3">
      <PlansTable plans={plans} usage={usage} customized={overrides.map((row) => row.planKey)} />
    </section>
  );
}

async function workspaceDirectorySection({ params, plans, now, activeWhere, expiringWhere }: {
  params: RecordSearchParams;
  plans: Plans;
  now: Date;
  activeWhere: Prisma.TenantWhereInput;
  expiringWhere: Prisma.TenantWhereInput;
}) {
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const filter = params.status === "suspended" || params.status === "active" || params.status === "renewal" ? params.status : "";
  const searchMatch = { contains: search, mode: "insensitive" } as const;
  const where: Prisma.TenantWhereInput = {
    AND: [
      filter === "renewal" ? expiringWhere : filter === "active" ? activeWhere : filter ? { status: filter } : {},
      search ? { OR: [{ name: searchMatch }, { slug: searchMatch }, { code: searchMatch }] } : {},
    ],
  };
  const pagination = recordPagination(await prisma.tenant.count({ where }), recordPageNumber(params.page) ?? 1, 25);
  const canonical = recordPageRedirect("/superadmin", params, pagination);
  if (canonical) redirect(canonical);
  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: pagination.offset,
    take: pagination.pageSize,
    select: {
      id: true, name: true, slug: true, status: true, plan: true, seats: true, subscriptionExpiry: true,
      _count: { select: { employees: true } },
      modules: { where: { enabled: true }, orderBy: { module: "asc" }, select: { module: true } },
    },
  });

  return (
        <section aria-label="Workspaces" className="space-y-3">
          <form key={`${search}:${filter}`} action="/superadmin" className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-card p-4">
            <label className="min-w-44 flex-1 space-y-1.5 text-sm font-medium">Find a workspace<Input name="q" defaultValue={search} maxLength={100} placeholder="Name, address or workspace code" /></label>
            <label className="min-w-40 space-y-1.5 text-sm font-medium">Workspace status<select name="status" defaultValue={filter} className="block h-11 w-full rounded-[11px] border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">All statuses</option><option value="active">Active accounts</option><option value="renewal">Expired or due within 30 days</option><option value="suspended">Suspended</option></select></label>
            <Button type="submit">Apply filters</Button>
            {(search || filter) && <Link href="/superadmin" className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-tint">Clear</Link>}
          </form>
          <TenantsTable plans={plans} baseDomain={process.env.APP_BASE_DOMAIN ?? "peoplenexa.in"} tenants={tenants.map(({ _count, modules, ...tenant }) => ({
            ...tenant,
            employeeCount: _count.employees,
            enabledModules: modules.map(({ module }) => module),
            expiryLabel: tenant.subscriptionExpiry ? formatDate(tenant.subscriptionExpiry) : null,
            expired: Boolean(tenant.subscriptionExpiry && tenant.subscriptionExpiry < now),
          }))} />
          <DocumentExpensePagination path="/superadmin" params={params} pagination={pagination} label="workspaces" />
        </section>
  );
}
