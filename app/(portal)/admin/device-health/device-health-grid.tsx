"use client";

import Link from "next/link";
import { useState } from "react";
import { Cable, Cloud, Network } from "lucide-react";
import { DeviceStatusBadge } from "@/components/devices/device-status";
import { useLiveEbioDevices } from "@/components/devices/use-live-ebio-devices";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/stat";
import { deviceHealthState, ebioDeviceHealthState, realtimeDeviceHealthState, type DeviceHealthState } from "@/lib/device-health";
import type { WorkspaceRegion } from "@/lib/workspace-region";

const fleets = [
  { key: "direct", label: "Direct devices", icon: Cable, state: deviceHealthState },
  { key: "ebio", label: "eBioserver", icon: Network, state: ebioDeviceHealthState },
  { key: "realtime", label: "Realtime", icon: Cloud, state: realtimeDeviceHealthState },
] as const;

interface Device {
  id: string;
  name: string;
  serialNumber: string;
  protocol: string;
  fleet: typeof fleets[number]["key"];
  branchName: string | null;
  status: string;
  lastSeenAt: Date | null;
  punchesToday: number;
  logs: number;
  errors: number;
}

export function DeviceHealthGrid({ devices: rows, region, liveEbio, canViewInventory = true }: { devices: Device[]; region: WorkspaceRegion; liveEbio: boolean; canViewInventory?: boolean }) {
  const { devices, now } = useLiveEbioDevices(rows, liveEbio);
  const [statusFilter, setStatusFilter] = useState<"all" | DeviceHealthState>("all");
  const [fleetFilter, setFleetFilter] = useState("all");
  const [query, setQuery] = useState("");
  const statusRows = devices.map((device) => {
    const fleet = fleets.find((item) => item.key === device.fleet)!;
    const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt) : null;
    return { device, lastSeen, state: fleet.state(device.status, lastSeen, now) };
  });
  const search = query.trim().toLowerCase();
  const visible = statusRows.filter(({ device, state }) => (statusFilter === "all" || state === statusFilter) && (fleetFilter === "all" || fleetFilter === device.fleet) && `${device.name} ${device.serialNumber} ${device.branchName ?? ""}`.toLowerCase().includes(search));
  const dateTime = new Intl.DateTimeFormat(region.locale, { dateStyle: "medium", timeStyle: "short", timeZone: region.timeZone });
  const totals = [
    { title: "Online or idle", value: statusRows.filter(({ state }) => state === "online" || state === "idle").length },
    { title: "Need attention", value: statusRows.filter(({ state }) => state === "offline" || state === "stale").length },
    { title: "Device punches today", value: devices.reduce((sum, device) => sum + device.punchesToday, 0) },
  ];

  return <>
    <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
      {totals.map((total) => <div key={total.title} className="min-w-0 rounded-2xl border border-edge bg-card px-4 py-3">
        <dt className="text-sm text-muted-foreground">{total.title}</dt><dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{total.value}</dd>
      </div>)}
    </dl>
    {devices.length > 0 && <div className="flex min-w-0 flex-wrap gap-2 rounded-2xl border border-edge bg-card p-3">
      <Input type="search" aria-label="Search device health" className="w-full sm:w-64" placeholder="Name, serial or branch" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Select aria-label="Filter by device service" className="w-full sm:w-48" value={fleetFilter} onChange={(event) => setFleetFilter(event.target.value)}>
        <option value="all">All services</option>{fleets.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
      </Select>
      <Select aria-label="Filter by device status" className="w-full sm:w-48" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
        <option value="all">All statuses</option><option value="online">Online</option><option value="idle">Idle</option><option value="offline">Offline</option><option value="stale">Stale</option><option value="disabled">Admin disabled</option>
      </Select>
    </div>}
    {visible.length === 0 && <Card><EmptyState title={devices.length ? "No devices match these filters" : "No devices registered"} description={devices.length ? "Change the search or filters." : "Register devices from Device inventory to see their status here."} /></Card>}
    {fleets.map(({ key, label, icon: Icon }) => {
      const members = visible.filter(({ device }) => device.fleet === key);
      if (!members.length) return null;
      return <section key={key} aria-label={label} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon aria-hidden="true" className="h-4 w-4 text-primary" />{label}</h2>{canViewInventory && <Link href={`/admin/devices?service=${key}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Open inventory</Link>}</div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {members.map(({ device, state, lastSeen }) => <Card key={device.id} className="min-w-0">
            <CardContent className="min-w-0 space-y-3 p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><h3 className="truncate font-semibold" title={device.name}>{device.name}</h3><p className="truncate font-mono text-xs text-muted-foreground" title={device.serialNumber}>{device.serialNumber}</p></div>
                <DeviceStatusBadge state={state} />
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-xl border border-edge bg-tint/40 p-3 text-sm">
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">Punches</dt><dd className="font-semibold tabular-nums">{device.punchesToday}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">All logs</dt><dd className="font-semibold tabular-nums">{device.logs}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">Log errors</dt><dd className={`font-semibold tabular-nums ${device.errors ? "text-destructive" : ""}`}>{device.errors}</dd></div>
              </dl>
              <p className="break-words text-xs text-muted-foreground">{[device.branchName, device.protocol, lastSeen ? `Last seen ${dateTime.format(lastSeen)}` : "No heartbeat recorded"].filter(Boolean).join(" · ")}</p>
            </CardContent>
          </Card>)}
        </div>
      </section>;
    })}
  </>;
}
