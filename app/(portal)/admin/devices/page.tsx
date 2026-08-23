import Link from "next/link";
import { Database, Fingerprint, ServerCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { getEbioserverConfig } from "@/lib/ebioserver";
import { DevicesPanel } from "./devices-panel";

export const dynamic = "force-dynamic";

export default async function AdminDevicesPage() {
  const session = await requireSession();

  const [devices, tenant] = await Promise.all([
    prisma.device.findMany({
      where: { tenantId: session.tenantId },
      include: { _count: { select: { logs: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
  ]);

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
  const ebio = getEbioserverConfig({ config: tenant?.config ?? null });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Biometric integrations"
        description="Choose direct ADMS/iClock devices or connect an eSSL BioServer. Both feed the same punch and attendance engine."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Fingerprint className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-semibold">Direct eSSL / ZKTeco device</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">For hardware configured to push ADMS/iClock logs directly to PeopleNexa.</p>
              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground"><Database className="h-3.5 w-3.5" /> {rows.length} registered device{rows.length === 1 ? "" : "s"}</div>
            </div>
          </div>
        </div>

        <Link href="/admin/settings#ebioserver" className="card-surface group rounded-2xl p-5 transition hover:border-primary/40 hover:bg-tint">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ServerCog className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-semibold">eSSL BioServer / eBioserver</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Connect the central eSSL server by URL and credentials, test it, import employees and pull punches.</p>
              <p className={`mt-3 text-[11.5px] font-medium ${ebio.enabled ? "text-emerald-400" : "text-amber-400"}`}>
                {ebio.enabled ? `Connected · every ${ebio.pollIntervalMinutes} min` : ebio.url ? "Configured but disabled" : "Not configured · open setup →"}
              </p>
            </div>
          </div>
        </Link>
      </div>

      <DevicesPanel rows={rows} counts={counts} />
    </div>
  );
}
