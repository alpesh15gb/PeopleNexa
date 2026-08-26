import { prisma } from "./prisma";
import { PLANS, type PlanDef } from "./modules";

/**
 * Server-only effective-plan resolver.
 *
 * Plans are defined in lib/modules.ts (client-safe defaults); super admins can
 * override pricing / seats / trial days / label / module set per plan via the
 * PlanOverride table. Everything that creates tenants or computes revenue must
 * read the *effective* plan through here so admin edits take effect.
 *
 * Keep out of client bundles: it imports prisma (Node builtins).
 */

interface OverrideRow {
  planKey: string;
  label: string | null;
  pricePerSeat: number | null;
  annualPricePerSeat: number | null;
  trialDays: number | null;
  seats: number | null;
  modules: string[];
}

let cache: { at: number; rows: OverrideRow[] } | null = null;
const CACHE_TTL_MS = 15_000;

export async function getPlanOverrides(): Promise<OverrideRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await prisma.planOverride.findMany();
  cache = { at: Date.now(), rows };
  return rows;
}

/** Drop the cached overrides after a super admin saves plan edits. */
export function invalidatePlansCache() {
  cache = null;
}

/** Code defaults merged with any super-admin overrides, for every plan. */
export async function getEffectivePlans(opts?: { fresh?: boolean }): Promise<PlanDef[]> {
  let overrides: OverrideRow[] = [];
  try {
    overrides = opts?.fresh ? await prisma.planOverride.findMany() : await getPlanOverrides();
  } catch {
    // Public surfaces should still render with code defaults while the database
    // is recovering. Existing cached overrides remain preferable when present.
    overrides = cache?.rows ?? [];
  }
  return PLANS.map((p) => {
    const o = overrides.find((r) => r.planKey === p.key);
    if (!o) return p;
    return {
      ...p,
      label: o.label ?? p.label,
      pricePerSeat: o.pricePerSeat ?? p.pricePerSeat,
      annualPricePerSeat: o.annualPricePerSeat ?? p.annualPricePerSeat,
      trialDays: o.trialDays ?? p.trialDays,
      seats: o.seats ?? p.seats,
      modules: o.modules.length > 0 ? o.modules : p.modules,
    };
  });
}

export async function getEffectivePlan(key: string): Promise<PlanDef> {
  const plans = await getEffectivePlans();
  return plans.find((p) => p.key === key) ?? plans[0];
}
