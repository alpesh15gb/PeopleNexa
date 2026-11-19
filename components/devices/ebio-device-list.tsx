"use client";

import { useEffect, useState } from "react";
import { ebioDeviceHealthState } from "@/lib/device-health";
import { DeviceStatusBadge, DeviceStatusLegend } from "./device-status";
import { useLiveEbioDevices } from "./use-live-ebio-devices";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type DeviceRow = {
  id: string; name: string; serialNumber: string; status: string;
  lastSeenAt: Date | null; logCount: number; branchName: string | null;
};

type LogRow = { id: string; userId: string | null; punchTime: string | null; processed: boolean; error: string | null };

export function EbioDeviceList({ rows }: { rows: DeviceRow[] }) {
  const { devices, now } = useLiveEbioDevices(rows);
  const [query, setQuery] = useState("");
  const [logsFor, setLogsFor] = useState<DeviceRow | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [logError, setLogError] = useState("");
  const selectedId = logsFor?.id;
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    async function fetchLogs() {
      try {
        const response = await fetch(`/api/devices/${selectedId}/logs?limit=100`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load device logs.");
        if (!controller.signal.aborted) setLogs(data.logs ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setLogError(error instanceof Error ? error.message : "Could not load device logs.");
      }
    }
    void fetchLogs();
    return () => controller.abort();
  }, [selectedId]);
  const search = query.trim().toLowerCase();
  const visible = devices.filter((device) => `${device.name} ${device.serialNumber} ${device.branchName ?? ""}`.toLowerCase().includes(search));
  return (
    <>
    <div className="card-surface overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-5 py-3"><div><h2 className="font-semibold">Discovered devices</h2><DeviceStatusLegend ebio /></div><Input type="search" className="w-full sm:w-60" aria-label="Search eBioserver devices" placeholder="Name, serial or branch" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {visible.sort((a, b) => ebioDeviceHealthState(a.status, a.lastSeenAt, now).localeCompare(ebioDeviceHealthState(b.status, b.lastSeenAt, now)) || a.name.localeCompare(b.name)).map((d) => {
        const state = ebioDeviceHealthState(d.status, d.lastSeenAt, now);
        return (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-edge px-5 py-3.5 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
              <p className="text-xs text-muted-foreground">{d.branchName ?? "No branch assigned"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DeviceStatusBadge state={state} />
              <span className="text-xs text-muted-foreground">{d.lastSeenAt ? `${formatDateTime(d.lastSeenAt)} IST` : "No heartbeat"} · {d.logCount} logs</span>
              <Button size="sm" variant="outline" aria-label={`View logs for ${d.name}`} onClick={() => { setLogs(null); setLogError(""); setLogsFor(d); }}>View logs</Button>
            </div>
          </div>
        );
      })}
      {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">No devices match this search.</p>}
    </div>
    <Modal open={logsFor !== null} onClose={() => setLogsFor(null)} title={`Logs for ${logsFor?.name ?? "device"}`} description="Latest 100 records · Times shown in IST" size="lg">
      {logError ? <p role="alert" className="text-sm text-destructive">{logError}</p> : logs === null ? <p role="status" className="text-sm text-muted-foreground">Loading logs…</p> : logs.length ? (
        <Table><THead><TR><TH>Employee code</TH><TH>Punch time</TH><TH>Processing status</TH></TR></THead><TBody>{logs.map((log) => <TR key={log.id}><TD className="font-mono">{log.userId ?? "—"}</TD><TD>{log.punchTime ? formatDateTime(new Date(log.punchTime)) : "—"}</TD><TD>{log.error ? <span className="text-destructive">{log.error}</span> : log.processed ? "Processed" : "Pending"}</TD></TR>)}</TBody></Table>
      ) : <p className="text-sm text-muted-foreground">No logs have been received from this device.</p>}
    </Modal>
    </>
  );
}
