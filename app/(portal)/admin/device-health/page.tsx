import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { DeviceHealthGrid } from "./device-health-grid";
import { istStartOfDay } from "@/lib/ist";

export const dynamic = "force-dynamic";

export default async function AdminDeviceHealthPage() {
  const session = await requireSession();
  const todayStart = istStartOfDay(new Date());

  const [devices, punchCounts, logCounts, errorCounts] = await Promise.all([
    prisma.device.findMany({
      where: { tenantId: session.tenantId },
      select: {
        id: true,
        name: true,
        serialNumber: true,
        ipAddress: true,
        type: true,
        protocol: true,
        config: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.punch.groupBy({
      by: ["deviceId"],
      where: { tenantId: session.tenantId, punchTime: { gte: todayStart } },
      _count: { _all: true },
    }),
    prisma.deviceLog.groupBy({
      by: ["deviceId"],
      _count: { _all: true },
    }),
    prisma.deviceLog.groupBy({
      by: ["deviceId"],
      where: { tenantId: session.tenantId, error: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const punchMap = new Map(punchCounts.map((p) => [p.deviceId, p._count._all]));
  const logMap = new Map(logCounts.map((l) => [l.deviceId, l._count._all]));
  const errorMap = new Map(errorCounts.map((e) => [e.deviceId, e._count._all]));

  const rows = devices.map((device) => ({
    ...device,
    ebio: Boolean((device.config as { ebioserver?: boolean } | null)?.ebioserver),
  }));
  const todayPunches = [...punchMap.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Device Health"
        description="Heartbeat health for ESSL and eBioserver devices. Last seen times are shown in IST."
      />
      <DeviceHealthGrid
        devices={rows}
        punchMap={Object.fromEntries(punchMap)}
        logMap={Object.fromEntries(logMap)}
        errorMap={Object.fromEntries(errorMap)}
        todayPunches={todayPunches}
      />
    </div>
  );
}
