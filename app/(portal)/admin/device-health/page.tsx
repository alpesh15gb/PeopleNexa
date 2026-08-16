import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
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

  const healthy = devices.filter(
    (d) => d.status !== "inactive" && d.lastSeenAt && d.lastSeenAt.getTime() > Date.now() - 24 * 3600 * 1000
  ).length;
  const offline = devices.filter((d) => d.status === "offline" || (d.status === "active" && (!d.lastSeenAt || d.lastSeenAt.getTime() <= Date.now() - 24 * 3600 * 1000))).length;
  const todayPunches = [...punchMap.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Device Health"
        description="Live status of every biometric / punch device connected to your account"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold text-emerald-300">{healthy}</p>
            <p className="text-[12px] text-muted-foreground">Healthy (seen in 24h)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold text-amber-300">{offline}</p>
            <p className="text-[12px] text-muted-foreground">Offline / stale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold">{todayPunches}</p>
            <p className="text-[12px] text-muted-foreground">Punches today</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <DeviceHealthGrid
            devices={devices}
            punchMap={Object.fromEntries(punchMap)}
            logMap={Object.fromEntries(logMap)}
            errorMap={Object.fromEntries(errorMap)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
