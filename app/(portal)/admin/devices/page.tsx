import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { DevicesPanel } from "./devices-panel";
import { DevicesTabs } from "./devices-tabs";
import { RealtimePanel, type RealtimeRow } from "./realtime-panel";

export const dynamic = "force-dynamic";

export default async function AdminDevicesPage() {
  const session = await requireSession();

  const [devices, rtDevices, tenant] = await Promise.all([
    prisma.device.findMany({
      where: { tenantId: session.tenantId },
      include: { _count: { select: { logs: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.realtimeDevice.findMany({
      where: { tenantId: session.tenantId },
      include: { _count: { select: { logs: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { code: true } }),
  ]);

  const isEbio = (d: { config: unknown }) =>
    Boolean((d.config as { ebioserver?: boolean } | null)?.ebioserver);

  const rows = devices
    .filter((d) => !isEbio(d))
    .map((d) => ({
      id: d.id,
      name: d.name,
      serialNumber: d.serialNumber,
      ipAddress: d.ipAddress,
      type: d.type,
      protocol: d.protocol,
      status: d.status,
      lastSeenAt: d.lastSeenAt,
      logCount: d._count.logs,
      createdAt: d.createdAt,
    }));

  const ebioRows = devices
    .filter(isEbio)
    .map((d) => ({
      id: d.id,
      name: d.name,
      serialNumber: d.serialNumber,
      lastSeenAt: d.lastSeenAt,
      status: d.status,
      logCount: d._count.logs,
    }));

  const rtRows: RealtimeRow[] = rtDevices.map((d) => ({
    id: d.id,
    name: d.name,
    serialNumber: d.serialNumber,
    productName: d.productName,
    protocol: d.protocol,
    capabilities: Array.isArray(d.capabilities) ? (d.capabilities as string[]) : [],
    ipAddress: d.ipAddress,
    status: d.status,
    lastSeenAt: d.lastSeenAt,
    linkedCount: d.linkedDeviceIds.length,
    logCount: d._count.logs,
    createdAt: d.createdAt,
  }));

  const now = Date.now();
  const online = (lastSeenAt: Date | null, status: string) =>
    status === "active" && lastSeenAt && now - lastSeenAt.getTime() < 5 * 60 * 1000;
  const counts = {
    total: rows.length,
    online: rows.filter((d) => online(d.lastSeenAt, d.status)).length,
    offline: rows.filter((d) => !online(d.lastSeenAt, d.status)).length,
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Biometric devices"
        description="ESSL / ADMS, eBioserver and Realtime cloud — punches from all three flow into the same attendance"
      />
      <DevicesTabs
        counts={counts}
        ebioCount={ebioRows.length}
        rtCount={rtRows.length}
        essl={<DevicesPanel rows={rows} counts={counts} />}
        ebio={
          ebioRows.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              No eBioserver devices yet — they auto-register on the next pull. Configure the connection in{" "}
              <a href="/admin/settings" className="underline">Settings → eBioserver</a>.
            </p>
          ) : (
            <div className="card-surface overflow-hidden rounded-2xl">
              {ebioRows.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-4 border-b border-edge px-5 py-3.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
                  </div>
                  <p className="shrink-0 text-[12px] text-muted-foreground">
                    {d.status === "active" && d.lastSeenAt && now - d.lastSeenAt.getTime() < 5 * 60 * 1000
                      ? "Online"
                      : "Offline"}{" "}
                    · {d.logCount} logs
                  </p>
                </div>
              ))}
            </div>
          )
        }
        realtime={
          <RealtimePanel
            rows={rtRows}
            webhookPath={tenant ? `/api/realtime/webhook/${tenant.code}/record` : null}
          />
        }
      />
    </div>
  );
}
