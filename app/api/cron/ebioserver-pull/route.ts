import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, getEbioserverPassword, pullTenant, updateEbioserverStatus } from "@/lib/ebioserver";
import { finalizeEligibleDays } from "@/lib/reconcile";
import { validateOutboundHttpUrl } from "@/lib/outbound-url";

export const dynamic = "force-dynamic";

function secretMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduler requests (valid CRON_SECRET) may process all tenants. A browser
 * admin may manually run only their own tenant. Missing CRON_SECRET never turns
 * this endpoint into a public all-tenant job.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim() ?? "";
  const suppliedSecret = req.headers.get("x-cron-secret");
  const scheduler = Boolean(expectedSecret) && secretMatches(suppliedSecret, expectedSecret);

  let tenantId: string | undefined;
  if (!scheduler) {
    const { getSession } = await import("@/lib/session");
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json(
        { error: expectedSecret ? "unauthorized" : "CRON_SECRET is not configured" },
        { status: expectedSecret ? 401 : 503 }
      );
    }
    tenantId = session.tenantId;
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: "active", ...(tenantId ? { id: tenantId } : {}) },
    select: { id: true, slug: true, config: true },
  });

  const results: Array<Record<string, unknown>> = [];
  for (const tenant of tenants) {
    // Finalization applies to mobile/direct-device tenants too, not only BioServer tenants.
    const finalized = await finalizeEligibleDays(tenant.id, 500);
    const profile = getEbioserverConfig(tenant);
    if (!profile.enabled || !profile.url || !getEbioserverPassword(profile)) {
      if (finalized > 0) results.push({ tenant: tenant.slug, ok: true, skipped: "ebioserver_disabled", finalized });
      continue;
    }

    // Honour each tenant's configured polling interval on scheduler ticks.
    if (scheduler && profile.lastPulledAt) {
      const last = Date.parse(profile.lastPulledAt);
      const dueAt = last + Math.max(1, profile.pollIntervalMinutes) * 60000;
      if (Number.isFinite(last) && Date.now() < dueAt) {
        continue;
      }
    }

    try {
      await validateOutboundHttpUrl(profile.url);
      const res = await pullTenant(tenant.id, profile);
      const now = new Date().toISOString();
      if (res.ok) {
        await updateEbioserverStatus(tenant.id, {
          lastPulledAt: now,
          lastError: null,
          lastErrorAt: null,
        });
        results.push({
          tenant: tenant.slug,
          ok: true,
          pulled: res.pulled,
          ingested: res.ingested,
          devices: res.devices,
          finalized,
        });
      } else {
        await updateEbioserverStatus(tenant.id, { lastError: res.message ?? "Pull failed", lastErrorAt: now });
        results.push({ tenant: tenant.slug, ok: false, error: res.message, finalized });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pull failed";
      await updateEbioserverStatus(tenant.id, { lastError: message, lastErrorAt: new Date().toISOString() });
      results.push({ tenant: tenant.slug, ok: false, error: message, finalized });
    }
  }

  return NextResponse.json({ ran: true, scheduler, tenants: results });
}
