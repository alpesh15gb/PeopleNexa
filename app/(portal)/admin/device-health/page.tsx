import Link from "next/link";
import { redirect } from "next/navigation";
import { Cable } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, timeZoneDayRange } from "@/lib/workspace-time";
import { DeviceHealthGrid } from "./device-health-grid";

export const dynamic = "force-dynamic";

export default async function AdminDeviceHealthPage() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/admin");
  const { tenantId } = session;

  const [tenant, access, devices, realtimeDevices] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { config: true } }),
    getTenantAccess(tenantId),
    prisma.device.findMany({ where: { tenantId }, select: { id: true, name: true, serialNumber: true, protocol: true, config: true, status: true, lastSeenAt: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.realtimeDevice.findMany({ where: { tenantId }, select: { id: true, name: true, serialNumber: true, protocol: true, status: true, lastSeenAt: true }, orderBy: { name: "asc" } }),
  ]);
  const region = workspaceRegion(tenant.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const { start, end } = timeZoneDayRange(today, region.timeZone);
  const directIds = devices.map((device) => device.id);
  const realtimeIds = realtimeDevices.map((device) => device.id);
  const directLogs = { tenantId, deviceId: { in: directIds } };
  const realtimeLogs = { tenantId, realtimeDeviceId: { in: realtimeIds } };
  const counts = { _all: true } as const;

  const [punchCounts, directTotal, directErrors, realtimeTotal, realtimeErrors] = await Promise.all([
    prisma.punch.groupBy({ by: ["deviceId", "realtimeDeviceId"], where: { tenantId, punchTime: { gte: start, lt: end }, OR: [{ deviceId: { in: directIds } }, { realtimeDeviceId: { in: realtimeIds } }] }, _count: counts }),
    prisma.deviceLog.groupBy({ by: ["deviceId"], where: directLogs, _count: counts }),
    prisma.deviceLog.groupBy({ by: ["deviceId"], where: { ...directLogs, error: { not: null } }, _count: counts }),
    prisma.realtimeLog.groupBy({ by: ["realtimeDeviceId"], where: realtimeLogs, _count: counts }),
    prisma.realtimeLog.groupBy({ by: ["realtimeDeviceId"], where: { ...realtimeLogs, error: { not: null } }, _count: counts }),
  ]);
  const punchMap = new Map<string, number>();
  for (const group of punchCounts) {
    const key = group.realtimeDeviceId ? `realtime:${group.realtimeDeviceId}` : group.deviceId;
    if (key) punchMap.set(key, (punchMap.get(key) ?? 0) + group._count._all);
  }
  const logMap = new Map([...directTotal.map((item) => [item.deviceId, item._count._all] as const), ...realtimeTotal.map((item) => [`realtime:${item.realtimeDeviceId}`, item._count._all] as const)]);
  const errorMap = new Map([...directErrors.map((item) => [item.deviceId, item._count._all] as const), ...realtimeErrors.map((item) => [`realtime:${item.realtimeDeviceId}`, item._count._all] as const)]);
  const rows = [
    ...devices.map(({ config, branch, ...device }) => ({ ...device, branchName: branch?.name ?? null, fleet: (config as { ebioserver?: boolean } | null)?.ebioserver ? "ebio" as const : "direct" as const })),
    ...realtimeDevices.map((device) => ({ ...device, id: `realtime:${device.id}`, branchName: null, fleet: "realtime" as const })),
  ].map((device) => ({ ...device, punchesToday: punchMap.get(device.id) ?? 0, logs: logMap.get(device.id) ?? 0, errors: errorMap.get(device.id) ?? 0 }));

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Device health" description={`Connection status and log activity · ${formatCalendarDate(today, region.locale)} · ${region.timeZone}`} actions={access.modules.has("devices") ? <Link href="/admin/devices" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-edge bg-card px-3 text-sm font-medium hover:bg-tint"><Cable aria-hidden="true" className="h-4 w-4" /> Device inventory</Link> : undefined} />
    <DeviceHealthGrid devices={rows} region={region} canViewInventory={access.modules.has("devices")} liveEbio={access.modules.has("devices") && rows.some((device) => device.fleet === "ebio")} />
  </div>;
}
