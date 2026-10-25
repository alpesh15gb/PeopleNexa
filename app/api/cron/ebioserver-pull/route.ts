import { processAttendanceReconcileJobs } from "@/lib/attendance-reconcile-jobs";
import { reprocessFailedLogs } from "@/lib/iclock";
import { reprocessFailedRealtimeLogs } from "@/lib/realtime-devices";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, getEbioserverPassword, pullTenant, updateEbioserverStatus } from "@/lib/ebioserver";
import { finalizeEligibleDays } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

// Single-process overlap guard: a slow pull must never stack with the next
// 5-minute tick and saturate the pool + event loop behind itself.
let pullRunning = false;

/**
 * Poll every tenant's own eBioserver and feed punches into the shared pipeline.
 *
 * Isolation contract ("a client can run but not mess up"):
 *  - Each tenant is pulled in its own try/catch with a hard per-call timeout.
 *  - A failing/hung tenant records lastError and is skipped; others continue.
 *  - Serial numbers are global, so a device can never be re-registered into
 *    another tenant.
 *
 * Trigger: POST with `x-cron-secret` matching CRON_SECRET (scheduler), or an
 * admin session for manual runs.
 */
export async function POST(req: NextRequest) {  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  // CRON_SECRET holders (scheduler) or superadmins may trigger a global pull.
  // A single tenant admin must never trigger pulls for all tenants.
  // When no secret is configured (non-prod), still require a superadmin —
  // never allow an open trigger.
  const authorizedBySecret = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  if (!authorizedBySecret) {
    const { requireActiveSession } = await import("@/lib/session");
    const session = await requireActiveSession().catch(() => null);
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true, slug: true, config: true, subscriptionExpiry: true },
  });

  if (pullRunning) {
    return NextResponse.json({ ran: false, reason: "previous pull still running" }, { status: 429 });
  }
  pullRunning = true;
  try {
    const results: Array<Record<string, unknown>> = [];
    for (const tenant of tenants) {
      if (tenant.subscriptionExpiry && tenant.subscriptionExpiry.getTime() < Date.now()) continue;
      const result: Record<string, unknown> = { tenant: tenant.slug, ok: true };
      try {
        const profile = getEbioserverConfig(tenant);
        const res = profile.enabled && profile.url && getEbioserverPassword(profile) ? await pullTenant(tenant.id, profile) : null;
        if (res) {
          Object.assign(result, { ok: res.ok, pulled: res.pulled, ingested: res.ingested, devices: res.devices, skipped: res.skipped, error: res.message });
          await updateEbioserverStatus(tenant.id, res.ok
            ? { lastPulledAt: new Date().toISOString(), lastError: null, lastErrorAt: null }
            : { lastError: res.message ?? "Pull failed", lastErrorAt: new Date().toISOString() });
        }
      } catch (err) {
        result.ok = false;
        result.error = err instanceof Error ? err.message : "Pull failed";
        await updateEbioserverStatus(tenant.id, { lastError: String(result.error), lastErrorAt: new Date().toISOString() }).catch(() => undefined);
      }
      // A device/network failure must not prevent already-saved punches recovering.
      for (const [key, work] of [
        ["recovery", () => reprocessFailedLogs(tenant.id, 200)],
        ["realtimeRecovery", () => reprocessFailedRealtimeLogs(tenant.id, 200)],
        ["reconciliation", () => processAttendanceReconcileJobs(tenant.id, 200)],
        ["finalized", () => finalizeEligibleDays(tenant.id, 500)],
      ] as const) {
        try { result[key] = await work(); }
        catch (err) { result.ok = false; result[`${key}Error`] = err instanceof Error ? err.message : "Processing failed"; }
      }
      results.push(result);
    }

    return NextResponse.json({ ran: true, tenants: results });
  } finally {
    pullRunning = false;
  }
}
