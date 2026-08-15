import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { DevicesPanel } from "./devices-panel";

export const dynamic = "force-dynamic";

export default async function AdminDevicesPage() {
  const session = await requireSession();

  const devices = await prisma.device.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { logs: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rows = devices.map((d) => ({
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

  const now = Date.now();
  const counts = {
    total: rows.length,
    online: rows.filter((d) => d.lastSeenAt && now - d.lastSeenAt.getTime() < 5 * 60 * 1000).length,
    offline: rows.filter((d) => !d.lastSeenAt || now - d.lastSeenAt.getTime() >= 5 * 60 * 1000).length,
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Biometric devices"
        description="Connect ESSL / ADMS devices — punches flow into attendance automatically"
      />
      <DevicesPanel rows={rows} counts={counts} />
    </div>
  );
}
