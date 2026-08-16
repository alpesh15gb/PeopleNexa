"use client";

import { Fingerprint, Wifi, WifiOff, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  function statusOf(d: Device): { label: string; cls: string; icon: React.ReactNode } {
    const seen = d.lastSeenAt ? Date.now() - d.lastSeenAt.getTime() : Infinity;
    if (d.status === "inactive") return { label: "Disabled", cls: "text-muted-foreground", icon: <WifiOff className="h-3.5 w-3.5" /> };
    if (d.status === "offline" || seen > 24 * 3600 * 1000)
      return { label: d.status === "offline" ? "Offline" : "Stale (>24h)", cls: "text-rose-300", icon: <WifiOff className="h-3.5 w-3.5" /> };
    if (seen > 2 * 3600 * 1000) return { label: "Idle", cls: "text-amber-300", icon: <Clock className="h-3.5 w-3.5" /> };
    return { label: "Online", cls: "text-emerald-300", icon: <Wifi className="h-3.5 w-3.5" /> };
  }

  function lastSeen(d: Device): string {
    if (!d.lastSeenAt) return "Never";
    const mins = Math.round((Date.now() - d.lastSeenAt.getTime()) / 60000);
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
    <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {devices.map((d) => {
        const st = statusOf(d);
        const errors = errorMap[d.id] ?? 0;
        return (
          <div key={d.id} className="card-surface rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", st.cls === "text-rose-300" ? "bg-rose-500/10" : "bg-tint-strong")}>
                {st.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
              </div>
              <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", `bg-tint-strong ${st.cls}`)}>
                {st.label}
              </span>
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
              <span className="ml-auto flex items-center gap-1">
                <Clock className="h-3 w-3" /> {lastSeen(d)}
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
    </div>
  );
}
