import { prisma } from "@/lib/prisma";
import { getEffectivePlan } from "@/lib/plans-server";

/**
 * Server-only tenant access snapshot (status + enabled modules).
 * Keep out of client bundles: it imports prisma (Node builtins).
 */

interface AccessSnapshot {
  status: string;
  subscriptionExpiry: Date | null;
  modules: Set<string>;
}

export async function getTenantAccess(tenantId: string): Promise<AccessSnapshot> {
  // The proxy and admin handlers may run in different bundles or processes.
  // Always read current access so suspension and module changes take effect across them.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      status: true,
      subscriptionExpiry: true,
      plan: true,
      modules: { select: { module: true, enabled: true } },
    },
  });
  if (!tenant) return { status: "suspended", subscriptionExpiry: null, modules: new Set() };

  // Tenants with no module rows yet (e.g. seeded before gating existed, or the
  // short window before the entrypoint backfill runs) fall back to their plan's
  // default module set so the workspace is never locked out.
  return {
    status: tenant.status,
    subscriptionExpiry: tenant.subscriptionExpiry,
    modules: tenant.modules.length
      ? new Set(tenant.modules.filter((row) => row.enabled).map((row) => row.module))
      : new Set((await getEffectivePlan(tenant.plan)).modules),
  };
}
