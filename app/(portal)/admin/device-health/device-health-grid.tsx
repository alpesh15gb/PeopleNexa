"use client";

import { useState } from "react";
import { Fingerprint, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { deviceHealthState, deviceStatusMetadata, type DeviceHealthState } from "@/lib/device-health";
import { DeviceStatusBadge, DeviceStatusLegend, deviceStatusDetail } from "@/components/devices/device-status";
import { formatDateTime } from "@/lib/dates";

interface Device {
  id: string;
  name: string;
  serialNumber: string;
  ipAddress: string | null;
  type: string;
  protocol: string;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export function DeviceHealthGrid({
  devices,
  punchMap,
  logMap,
  errorMap,
}: {
  devices: Device[];
  punchMap: Record<string, number>;
  logMap: Record<string, number>;
  errorMap: Record<string, number>;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | DeviceHealthState>("all");
  const now = Date.now();
  const stateOf = (d: Device) => deviceHealthState(d.status, d.lastSeenAt, now);
  const visibleDevices = devices.filter((d) => statusFilter === "all" || stateOf(d) === statusFilter)
    .sort((a, b) => stateOf(a).localeCompare(stateOf(b)) || a.name.localeCompare(b.name));

  function lastSeen(d: Device): string {
    if (!d.lastSeenAt) return "Never";
    const mins = Math.max(0, Math.round((now - d.lastSeenAt.getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Fingerprint className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">No devices registered — add one under Devices to monitor it here.</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DeviceStatusLegend />
        <label className="text-[12px] text-muted-foreground"><span className="sr-only">Filter devices by status</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | DeviceHealthState)} className="h-9 rounded-lg border border-edge bg-tint px-2 text-foreground"><option value="all">All statuses</option><option value="online">Online</option><option value="idle">Idle</option><option value="stale">Stale</option><option value="offline">Offline</option><option value="disabled">Admin disabled</option></select></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleDevices.map((d) => {
        const state = stateOf(d);
        const detail = deviceStatusDetail(state);
        const errors = errorMap[d.id] ?? 0;
        return (
          <div key={d.id} className="card-surface rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", state === "offline" || state === "stale" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-tint-strong text-muted-foreground")}>
                <detail.Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
              </div>
              <DeviceStatusBadge state={state} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-tint px-2 py-2">
                <p className="font-mono text-[15px] font-bold">{punchMap[d.id] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Punches today</p>
              </div>
              <div className="rounded-lg bg-tint px-2 py-2">
                <p className="font-mono text-[15px] font-bold">{logMap[d.id] ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Logs total</p>
              </div>
              <div className="rounded-lg bg-tint px-2 py-2">
                <p className={cn("font-mono text-[15px] font-bold", errors > 0 ? "text-rose-300" : "")}>{errors}</p>
                <p className="text-[10px] text-muted-foreground">Errors</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md bg-tint-strong px-1.5 py-0.5 capitalize">{d.type}</span>
              <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono">{d.protocol}</span>
              {d.ipAddress && <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono">{d.ipAddress}</span>}
              <span className="ml-auto flex items-center gap-1" title={d.lastSeenAt ? `${formatDateTime(d.lastSeenAt)} IST` : deviceStatusMetadata(state)}>
                <Clock className="h-3 w-3" aria-hidden="true" /> {lastSeen(d)}{d.lastSeenAt && " IST"}
              </span>
            </div>
            {errors > 0 && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
                <AlertTriangle className="h-3 w-3" /> {errors} unprocessed/failed log{errors === 1 ? "" : "s"} — check the device log
              </p>
            )}
          </div>
        );
      })}
      {visibleDevices.length === 0 && <p className="col-span-full py-10 text-center text-[13px] text-muted-foreground">No devices match this status.</p>}
      </div>
    </div>
  );
}
