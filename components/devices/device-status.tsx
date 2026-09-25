import { Clock, MonitorOff, Wifi, WifiOff } from "lucide-react";
import { type DeviceHealthState } from "@/lib/device-health";
import { cn } from "@/lib/utils";

const statusDetails: Record<DeviceHealthState, { label: string; description: string; className: string; legendClassName: string; Icon: typeof Wifi }> = {
  online: { label: "Online", description: "A recent source heartbeat was received.", className: "border-emerald-700/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-300", legendClassName: "text-emerald-700 dark:text-emerald-300", Icon: Wifi },
  offline: { label: "Offline", description: "No source heartbeat has been received, or it is outside its online window.", className: "border-rose-700/25 bg-rose-50 text-rose-700 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-300", legendClassName: "text-rose-700 dark:text-rose-300", Icon: WifiOff },
  stale: { label: "Stale", description: "Last heartbeat is over 24 hours old.", className: "border-rose-700/25 bg-rose-50 text-rose-700 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-300", legendClassName: "text-rose-700 dark:text-rose-300", Icon: WifiOff },
  idle: { label: "Idle", description: "Last heartbeat is 2 to 24 hours old.", className: "border-amber-800/25 bg-amber-50 text-amber-800 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-300", legendClassName: "text-amber-800 dark:text-amber-300", Icon: Clock },
  disabled: { label: "Admin disabled", description: "Disabled by an administrator; connection state is not evaluated.", className: "border-slate-700/25 bg-slate-100 text-slate-700 dark:border-slate-400/35 dark:bg-slate-500/15 dark:text-slate-200", legendClassName: "text-slate-700 dark:text-slate-200", Icon: MonitorOff },
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
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground">Status guide:</span>
      <span><b className={statusDetails.online.legendClassName}>Online</b> {realtime ? "source report within 5 min" : "heartbeat within 2h"}</span>
      {!realtime && <span><b className={statusDetails.idle.legendClassName}>Idle</b> 2-24h</span>}
      {!realtime && <span><b className={statusDetails.stale.legendClassName}>Stale</b> over 24h</span>}
      <span><b className={statusDetails.offline.legendClassName}>Offline</b> no heartbeat or outside online window</span>
      <span><b className={statusDetails.disabled.legendClassName}>Admin disabled</b> not evaluated</span>
    </p>
  );
}
