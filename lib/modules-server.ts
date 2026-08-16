import { prisma } from "@/lib/prisma";
import { planFor } from "@/lib/modules";

/**
 * Server-only tenant access snapshot (status + enabled modules).
 * Keep out of client bundles: it imports prisma (Node builtins).
 */

interface AccessSnapshot {
  status: string;
  subscriptionExpiry: Date | null;
  modules: Set<string>;
}

const cache = new Map<string, { at: number; snap: AccessSnapshot }>();
const CACHE_TTL_MS = 15_000;

export async function getTenantAccess(tenantId: string): Promise<AccessSnapshot> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.snap;

  const [tenant, moduleRows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, subscriptionExpiry: true, plan: true },
    }),
    prisma.tenantModule.findMany({
      where: { tenantId, enabled: true },
      select: { module: true },
    }),
  ]);

  // Tenants with no module rows yet (e.g. seeded before gating existed, or the
  // short window before the entrypoint backfill runs) fall back to their plan's
  // default module set so the workspace is never locked out.
  const modules =
    moduleRows.length > 0
      ? new Set(moduleRows.map((r) => r.module))
      : new Set(planFor(tenant?.plan ?? "trial").modules);

  const snap: AccessSnapshot = {
    status: tenant?.status ?? "suspended",
    subscriptionExpiry: tenant?.subscriptionExpiry ?? null,
    modules,
  };
  cache.set(tenantId, { at: Date.now(), snap });
  return snap;
}

/** Invalidate the cached snapshot after a license/module change. */
export function invalidateTenantAccess(tenantId: string) {
  cache.delete(tenantId);
}
