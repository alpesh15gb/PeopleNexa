"use client";

import { useState } from "react";
import {
  Fingerprint,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";

export interface DeviceRow {
  id: string;
  name: string;
  serialNumber: string;
  ipAddress: string | null;
  type: string;
  protocol: string;
  status: string;
  lastSeenAt: Date | null;
  logCount: number;
  createdAt: Date;
}

interface DeviceLog {
  id: string;
  rawData: string | null;
  userId: string | null;
  punchTime: string | null;
  processed: boolean;
  error: string | null;
  createdAt: string;
}

export function DevicesPanel({ rows, counts }: { rows: DeviceRow[]; counts: { total: number; online: number; offline: number } }) {
  const toast = useToast();
  const [devices, setDevices] = useState(rows);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logsFor, setLogsFor] = useState<DeviceRow | null>(null);
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const now = Date.now();
  const isOnline = (d: DeviceRow) => d.status === "active" && d.lastSeenAt && now - d.lastSeenAt.getTime() < 5 * 60 * 1000;

  async function addDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          serialNumber: form.get("serialNumber"),
          ipAddress: form.get("ipAddress"),
          type: form.get("type"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.device) {
        toast("error", data.error ?? "Failed to add device");
        return;
      }
      toast("success", `${data.device.name} added — point the device at /iclock/cdata?SN=${data.device.serialNumber}`);
      setDevices((prev) => [...prev, { ...data.device, lastSeenAt: null, logCount: 0 }]);
      setAddOpen(false);
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function runCommand(id: string, action: string, successMsg: string) {
    try {
      const res = await fetch(`/api/devices/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.queued) {
        toast("error", data.error ?? "Command failed");
        return;
      }
      toast("success", successMsg);
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function removeDevice(d: DeviceRow) {
    if (!window.confirm(`Delete ${d.name}? Its logs will be removed too.`)) return;
    try {
      const res = await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("error", "Failed to delete device");
        return;
      }
      toast("success", `${d.name} deleted`);
      setDevices((prev) => prev.filter((x) => x.id !== d.id));
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function openLogs(d: DeviceRow) {
    setLogsFor(d);
    setLogs([]);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/devices/${d.id}/logs?limit=100`);
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      toast("error", "Could not load logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  const stat = (label: string, value: number, cls: string) => (
    <div className="card-surface rounded-2xl p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 font-display text-2xl font-bold", cls)}>{value}</p>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {stat("Total devices", counts.total, "text-foreground")}
        {stat("Online", counts.online, "text-emerald-400")}
        {stat("Offline", counts.offline, "text-amber-400")}
      </div>

      <div className="card-surface overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <div>
            <p className="text-[13.5px] font-semibold">Registered devices</p>
            <p className="text-[12px] text-muted-foreground">
              Devices push punches to <span className="font-mono text-[11px]">/iclock/cdata?SN=…</span>
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add device
          </Button>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Device</TH>
              <TH>Type</TH>
              <TH>IP address</TH>
              <TH>Status</TH>
              <TH>Logs</TH>
              <TH>Last seen</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {devices.length === 0 && (
              <TR>
                <TD colSpan={7} className="py-12 text-center">
                  <Fingerprint className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-[13.5px] font-medium">No devices yet</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Add an ESSL device with its serial number to start receiving punches.
                  </p>
                </TD>
              </TR>
            )}
            {devices.map((d) => {
              const online = isOnline(d);
              return (
                <TR key={d.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-white">
                        <Fingerprint className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 leading-tight">
                        <p className="truncate text-[13.5px] font-semibold">{d.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="capitalize text-[13px]">{d.type}</TD>
                  <TD className="font-mono text-[12px] text-muted-foreground">{d.ipAddress || "—"}</TD>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                        d.status === "inactive"
                          ? "bg-muted text-muted-foreground"
                          : online
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                      )}
                    >
                      {d.status === "inactive" ? (
                        <Monitor className="h-3 w-3" />
                      ) : online ? (
                        <Wifi className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {d.status === "inactive" ? "Inactive" : online ? "Online" : "Offline"}
                    </span>
                  </TD>
                  <TD className="text-[13px] text-muted-foreground">{d.logCount}</TD>
                  <TD className="text-[12.5px] text-muted-foreground">
                    {d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "Never"}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="View logs"
                        onClick={() => openLogs(d)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <ScrollText className="h-4 w-4" />
                      </button>
                      <button
                        title="Sync attendance logs"
                        onClick={() => runCommand(d.id, "sync", "Sync command queued")}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        title="Reboot device"
                        onClick={() => runCommand(d.id, "reboot", "Reboot command queued")}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        title="Sync device clock"
                        onClick={() => runCommand(d.id, "set_time", "Time-sync command queued")}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        title="Delete device"
                        onClick={() => removeDevice(d)}
                        className="rounded-lg p-2 text-rose-300 transition-colors hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {/* Add device */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add biometric device"
        description="ESSL / ZKTeco ADMS device — enter the serial number printed on the unit"
      >
        <form onSubmit={addDevice} className="space-y-4">
          <Field label="Device name">
            <Input name="name" required placeholder="Main entrance — fingerprint" />
          </Field>
          <Field label="Serial number" hint="Printed on the device, e.g. ESQ3001...">
            <Input name="serialNumber" required placeholder="Device serial number" className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="IP address (optional)">
              <Input name="ipAddress" placeholder="192.168.1.50" className="font-mono" />
            </Field>
            <Field label="Type">
              <select
                name="type"
                className="h-10 w-full appearance-none rounded-xl border border-input bg-card-2 px-3.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
                defaultValue="biometric"
              >
                <option value="biometric">Fingerprint</option>
                <option value="face">Face</option>
                <option value="card">Card / RFID</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add device
            </Button>
          </div>
        </form>
      </Modal>

      {/* Logs */}
      <Modal
        open={Boolean(logsFor)}
        onClose={() => setLogsFor(null)}
        title={`${logsFor?.name ?? ""} — raw logs`}
        description="Immutable device records; punches are matched to attendance after processing"
        size="lg"
      >
        {loadingLogs ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">Loading logs…</p>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">No logs received yet.</p>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {logs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-tint px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-foreground">{l.userId ?? "—"}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{l.rawData || l.error || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11.5px] text-muted-foreground">{l.punchTime ? formatDateTime(new Date(l.punchTime)) : "—"}</p>
                  <span
                    className={cn(
                      "text-[10.5px] font-medium",
                      l.error ? "text-amber-400" : l.processed ? "text-emerald-400" : "text-muted-foreground"
                    )}
                  >
                    {l.error ? "flag" : l.processed ? "processed" : "pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
