import { NextResponse } from "next/server";
import { getEbioserverConfig, getEbioserverPassword, refreshEbioDeviceHealth } from "@/lib/ebioserver";
import { managerLocationId } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Coalesce simultaneous page loads in one app process; separate tenants and
// location-scoped device sets must never share a result.
const activeRefreshes = new Map<string, Promise<{ refreshed: number; unavailable: number }>>();

/**
 * A status-only eBio poll. It never reads or ingests attendance logs.
 * The browser calls this at a fixed cadence while Device Health is open.
 */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const locationId = session.role === "location_manager" ? await managerLocationId(session) : null;
  if (session.role === "location_manager" && !locationId) {
    return NextResponse.json({ error: "no location assigned" }, { status: 403 });
  }

  const [tenant, devices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.device.findMany({
      where: { tenantId: session.tenantId, config: { path: ["ebioserver"], equals: true }, ...(locationId ? { branch: { locationId } } : {}) },
      select: { id: true, serialNumber: true, status: true },
    }),
  ]);
  if (!tenant) return NextResponse.json({ error: "workspace not found" }, { status: 404 });

  const profile = getEbioserverConfig(tenant);
  let refreshed = 0;
  let unavailable = 0;
  if (profile.enabled && profile.url && getEbioserverPassword(profile)) {
    const key = `${session.tenantId}:${devices.map((device) => device.id).sort().join(",")}`;
    let refresh = activeRefreshes.get(key);
    if (!refresh) {
      refresh = refreshEbioDeviceHealth(profile, devices).finally(() => activeRefreshes.delete(key));
      activeRefreshes.set(key, refresh);
    }
    ({ refreshed, unavailable } = await refresh);
  }

  const current = await prisma.device.findMany({
    where: { id: { in: devices.map((device) => device.id) } },
    select: { id: true, status: true, lastSeenAt: true },
  });
  return NextResponse.json(
    { devices: current, refreshed, unavailable, polledAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
