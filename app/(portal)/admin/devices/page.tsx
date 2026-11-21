import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Cable, Cloud, MonitorCheck, Network } from "lucide-react";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat";
import { EbioDeviceList } from "@/components/devices/ebio-device-list";
import { deviceHealthState, ebioDeviceHealthState, realtimeDeviceHealthState, type DeviceHealthState } from "@/lib/device-health";
import { workspaceRegion } from "@/lib/workspace-region";
import { getEbioserverConfig } from "@/lib/ebioserver";
import { managerLocationId } from "@/lib/location-scope";
import { getTenantAccess } from "@/lib/modules-server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { DevicesPanel } from "./devices-panel";
import { RealtimePanel, type RealtimeRow } from "./realtime-panel";

export const dynamic = "force-dynamic";

const fleetNav = [
  { key: "overview", label: "Overview" },
  { key: "direct", label: "Direct devices" },
  { key: "ebio", label: "eBioserver" },
  { key: "realtime", label: "Realtime" },
] as const;

const actionLink = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-edge bg-card px-3 text-sm font-medium hover:bg-tint";

function fleetStats(states: DeviceHealthState[]) {
  return {
    total: states.length,
    healthy: states.filter((state) => state === "online" || state === "idle").length,
    attention: states.filter((state) => state === "stale" || state === "offline").length,
    disabled: states.filter((state) => state === "disabled").length,
  };
}

export default async function AdminDevicesPage({ searchParams }: { searchParams: Promise<{ service?: string; q?: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/admin");
  const isAdmin = session.role === "admin";
  const ownLocationId = await managerLocationId(session);
  if (!isAdmin && !ownLocationId) return <div className="space-y-5"><PageHeader title="Attendance devices" /><Card><EmptyState title="A location assignment is required" description="Ask a workspace administrator to assign the location you manage." /></Card></div>;

  const { tenantId } = session;
  const deviceWhere = { tenantId, ...(ownLocationId ? { branch: { tenantId, locationId: ownLocationId } } : {}) };
  const [query, access, devices, realtime, tenant, branches, location] = await Promise.all([
    searchParams,
    getTenantAccess(tenantId),
    prisma.device.findMany({ where: deviceWhere, include: { branch: { select: { name: true } }, _count: { select: { logs: { where: { tenantId } } } } }, orderBy: { name: "asc" } }),
    isAdmin ? prisma.realtimeDevice.findMany({ where: { tenantId }, select: { id: true, name: true, serialNumber: true, productName: true, protocol: true, capabilities: true, ipAddress: true, status: true, lastSeenAt: true, linkedDeviceIds: true, createdAt: true, _count: { select: { logs: { where: { tenantId } } } } }, orderBy: { name: "asc" } }) : [],
    isAdmin ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true, config: true } }) : null,
    prisma.branch.findMany({ where: { tenantId, ...(ownLocationId ? { locationId: ownLocationId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ownLocationId ? prisma.location.findFirst({ where: { id: ownLocationId, tenantId }, select: { name: true } }) : null,
  ]);

  const nav = fleetNav.filter((item) => item.key !== "realtime" || isAdmin);
  const service = nav.find((item) => item.key === query.service || (item.key === "direct" && query.service === "essl"))?.key ?? "overview";
  const term = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const matches = (row: { name: string; serialNumber: string; branchName?: string | null }) => `${row.name} ${row.serialNumber} ${row.branchName ?? ""}`.toLowerCase().includes(term.toLowerCase());
  const profile = tenant ? getEbioserverConfig(tenant) : null;
  const connectionConfigured = Boolean(profile?.enabled && profile.url && profile.passwordEnc);
  const region = workspaceRegion(tenant?.config);
  const pullTime = profile?.lastPulledAt ? new Date(profile.lastPulledAt) : null;
  const pullLabel = pullTime && Number.isFinite(pullTime.getTime())
    ? new Intl.DateTimeFormat(region.locale, { dateStyle: "medium", timeStyle: "short", timeZone: region.timeZone }).format(pullTime)
    : null;
  const now = Date.now();
  const directRows = [];
  const ebioRows = [];
  for (const device of devices) {
    const row = { id: device.id, name: device.name, serialNumber: device.serialNumber, branchName: device.branch?.name ?? null, status: device.status, lastSeenAt: device.lastSeenAt, logCount: device._count.logs };
    if ((device.config as { ebioserver?: boolean } | null)?.ebioserver) ebioRows.push(row);
    else directRows.push({ ...row, ipAddress: device.ipAddress, type: device.type, protocol: device.protocol, createdAt: device.createdAt });
  }
  const realtimeRows: RealtimeRow[] = realtime.map((device) => ({
    id: device.id, name: device.name, serialNumber: device.serialNumber, productName: device.productName, protocol: device.protocol, ipAddress: device.ipAddress, status: device.status, lastSeenAt: device.lastSeenAt, createdAt: device.createdAt,
    capabilities: Array.isArray(device.capabilities) ? device.capabilities.filter((value): value is string => typeof value === "string") : [],
    linkedDeviceIds: device.linkedDeviceIds, logCount: device._count.logs,
  }));
  const directStats = fleetStats(directRows.map((row) => deviceHealthState(row.status, row.lastSeenAt, now)));
  const services = [
    { key: "direct", title: "Direct devices", details: "Register and manage ESSL and ZKTeco devices that send clock punches directly.", icon: Cable, stats: directStats },
    { key: "ebio", title: "eBioserver", details: "Review devices discovered through your eBioserver connection and their latest heartbeat.", icon: Network, stats: fleetStats(ebioRows.map((row) => ebioDeviceHealthState(row.status, row.lastSeenAt, now))) },
    ...(isAdmin ? [{ key: "realtime", title: "Realtime", details: "Manage cloud-connected devices, credentials and synchronization links.", icon: Cloud, stats: fleetStats(realtimeRows.map((row) => realtimeDeviceHealthState(row.status, row.lastSeenAt, now))) }] : []),
  ];
  const deviceHref = (key: string, value = term) => key === "overview" ? "/admin/devices" : `/admin/devices?${new URLSearchParams({ service: key, ...(value && { q: value }) })}`;

  return <div className="space-y-5">
    <PageHeader title="Attendance devices" description={isAdmin ? "Manage device connections and monitor punch delivery across your workspace." : `Device inventory for ${location?.name ?? "your assigned location"}.`} actions={<>
      {isAdmin && access.modules.has("platform") && <Link href={service === "overview" ? "/admin/device-health" : `/admin/device-health?service=${service}`} className={actionLink}><MonitorCheck aria-hidden="true" className="h-4 w-4" /> Device health</Link>}
      {access.modules.has("reports") && <Link href="/admin/reports/punch-details" className={actionLink}><BarChart3 aria-hidden="true" className="h-4 w-4" /> Punch details</Link>}
    </>} />
    <nav aria-label="Device services" className="flex flex-wrap gap-x-5 border-b border-edge text-sm">
      {nav.map((item) => <Link key={item.key} href={deviceHref(item.key)} aria-current={service === item.key ? "page" : undefined} className={`border-b-2 px-1 py-3 font-medium ${service === item.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</Link>)}
    </nav>
    {isAdmin && service === "ebio" && <section aria-label="eBioserver ingestion" className="rounded-xl border border-edge bg-card p-4">
      <h2 className="font-semibold">Punch import</h2>
      <p className="mt-1 text-sm">{pullLabel ? `Last recorded pull · ${pullLabel} (${region.timeZone})` : "No pull has been recorded."}</p>
      {profile?.lastError && <p className="mt-1 text-sm text-destructive">An import error is recorded. Review the connection details in settings.</p>}
      <Link href="/admin/settings#device-connection" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Open connection settings</Link>
    </section>}
    {service !== "overview" && <form action="/admin/devices" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="service" value={service} />
      <Input aria-label="Search device inventory" name="q" defaultValue={term} key={term} maxLength={100} type="search" placeholder="Find a device by name or serial" className="w-full sm:w-72" />
      <Button variant="outline" type="submit">Search</Button>{term && <Link href={deviceHref(service, "")} className="inline-flex min-h-10 items-center p-2 text-sm text-primary hover:underline">Clear search</Link>}
    </form>}
    {service === "overview" && <section aria-label="Device connection types" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {services.map(({ key, title, details, icon: Icon, stats }) => <Card key={key}>
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon aria-hidden="true" className="h-5 w-5" /></div><div><h2 className="font-display text-base font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{details}</p></div></div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-edge bg-tint/40 p-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Registered</dt><dd className="font-semibold tabular-nums">{stats.total}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Online or idle</dt><dd className="font-semibold tabular-nums">{stats.healthy}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Needs attention</dt><dd className="font-semibold tabular-nums">{stats.attention}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Admin disabled</dt><dd className="font-semibold tabular-nums">{stats.disabled}</dd></div>
          </dl>
          <Link href={deviceHref(key)} className="mt-auto inline-flex min-h-10 items-center gap-2 self-start text-sm font-semibold text-primary underline-offset-4 hover:underline">{key === "ebio" ? "View eBioserver devices" : `Manage ${title.toLowerCase()}${key === "realtime" ? " devices" : ""}`} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </CardContent>
      </Card>)}
    </section>}
    {term && (service === "direct" && !directRows.some(matches) || service === "realtime" && !realtimeRows.some(matches)) &&
      <p role="status" className="text-sm text-muted-foreground">No devices match your search in this service.</p>}
    {service === "direct" && <DevicesPanel rows={directRows.filter(matches)} branches={branches} requireBranch={Boolean(ownLocationId)} />}
    {service === "ebio" && <>
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display font-semibold">eBioserver connection</h2><p className="mt-1 text-sm text-muted-foreground">{isAdmin ? connectionConfigured ? "Connection settings saved. Discovered devices appear after a successful sync." : "Configure the workspace connection to discover and sync devices." : "A workspace administrator manages the connection. The list shows devices assigned to your location."}</p></div>{isAdmin && <Link href="/admin/settings#device-connection" className={actionLink}>Connection settings <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}</CardContent></Card>
      {ebioRows.some(matches) ? <EbioDeviceList rows={ebioRows.filter(matches)} /> : <Card><EmptyState title={term ? "No eBioserver devices match your search" : "No eBioserver devices in this scope"} description={isAdmin ? "Check connection settings and sync devices to populate this list." : "Devices appear when they are discovered and assigned to your location."} /></Card>}
    </>}
    {service === "realtime" && isAdmin && <RealtimePanel rows={realtimeRows.filter(matches)} webhookPath={tenant ? `/api/realtime/webhook/${tenant.code}/record` : null} />}
  </div>;
}
