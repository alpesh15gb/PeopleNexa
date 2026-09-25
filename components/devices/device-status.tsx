import { Clock, MonitorOff, Wifi, WifiOff } from "lucide-react";
import { type DeviceHealthState } from "@/lib/device-health";
import { cn } from "@/lib/utils";

const statusDetails: Record<DeviceHealthState, { label: string; description: string; className: string; Icon: typeof Wifi }> = {
  online: { label: "Online", description: "A recent source heartbeat was received.", className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100", Icon: Wifi },
  offline: { label: "Offline", description: "No source heartbeat has been received, or it is outside its online window.", className: "border-rose-500/40 bg-rose-500/15 text-rose-100", Icon: WifiOff },
  stale: { label: "Stale", description: "Last heartbeat is over 24 hours old.", className: "border-rose-500/40 bg-rose-500/15 text-rose-100", Icon: WifiOff },
  idle: { label: "Idle", description: "Last heartbeat is 2 to 24 hours old.", className: "border-amber-500/40 bg-amber-500/15 text-amber-100", Icon: Clock },
  disabled: { label: "Admin disabled", description: "Disabled by an administrator; connection state is not evaluated.", className: "border-slate-500/40 bg-slate-500/15 text-slate-100", Icon: MonitorOff },
};

export function deviceStatusDetail(state: DeviceHealthState) {
  return statusDetails[state];
}

export function DeviceStatusBadge({ state, className }: { state: DeviceHealthState; className?: string }) {
  const { label, description, className: colorClass, Icon } = statusDetails[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", colorClass, className)}
      aria-label={`Device status: ${label}. ${description}`}
      title={description}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function DeviceStatusLegend({ realtime = false }: { realtime?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Status guide:</span>
      <span><b className="text-emerald-100">Online</b> {realtime ? "source report within 5 min" : "heartbeat within 2h"}</span>
      {!realtime && <span><b className="text-amber-100">Idle</b> 2-24h</span>}
      {!realtime && <span><b className="text-rose-100">Stale</b> over 24h</span>}
      <span><b className="text-rose-100">Offline</b> no heartbeat or outside online window</span>
      <span><b className="text-slate-100">Admin disabled</b> not evaluated</span>
    </p>
  );
}
