"use client";

import { ebioDeviceHealthState, deviceStatusMetadata } from "@/lib/device-health";
import { DeviceStatusBadge, DeviceStatusLegend } from "./device-status";
import { useLiveEbioDevices } from "./use-live-ebio-devices";
import { formatDateTime } from "@/lib/dates";

type DeviceRow = {
  id: string; name: string; serialNumber: string; status: string;
  lastSeenAt: Date | null; logCount: number;
};

export function EbioDeviceList({ rows }: { rows: DeviceRow[] }) {
  const { devices, now } = useLiveEbioDevices(rows);
  return (
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="border-b border-edge px-5 py-3"><DeviceStatusLegend ebio /></div>
      {[...devices].sort((a, b) => ebioDeviceHealthState(a.status, a.lastSeenAt, now).localeCompare(ebioDeviceHealthState(b.status, b.lastSeenAt, now)) || a.name.localeCompare(b.name)).map((d) => {
        const state = ebioDeviceHealthState(d.status, d.lastSeenAt, now);
        return (
          <div key={d.id} className="flex items-center justify-between gap-4 border-b border-edge px-5 py-3.5 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DeviceStatusBadge state={state} />
              <span className="text-[12px] text-muted-foreground" title={d.lastSeenAt ? `${formatDateTime(d.lastSeenAt)} IST` : deviceStatusMetadata(state)}>{d.lastSeenAt ? `${formatDateTime(d.lastSeenAt)} IST · ${d.logCount} logs` : deviceStatusMetadata(state, d.logCount)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
