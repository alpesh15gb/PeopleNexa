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
  KeyRound,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";

export interface RealtimeRow {
  id: string;
  name: string;
  serialNumber: string;
  productName: string | null;
  protocol: string;
  capabilities: string[];
  ipAddress: string | null;
  status: string;
  lastSeenAt: Date | null;
  linkedCount: number;
  logCount: number;
  createdAt: Date;
}

interface RtLog {
  id: string;
  rawData: string | null;
  userId: string | null;
  punchTime: string | null;
  processed: boolean;
  error: string | null;
  createdAt: string;
}

export function RealtimePanel({ rows, webhookPath }: { rows: RealtimeRow[]; webhookPath: string | null }) {
  const toast = useToast();
  const [devices, setDevices] = useState(rows);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<RealtimeRow | null>(null);
  const [logs, setLogs] = useState<RtLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [linkFor, setLinkFor] = useState<RealtimeRow | null>(null);
  const [linkSel, setLinkSel] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<RealtimeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const now = Date.now();
  const isOnline = (d: RealtimeRow) =>
    d.status === "active" && d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < 5 * 60 * 1000;
  const onlineCount = devices.filter(isOnline).length;

  async function addDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setNewKey(null);
    const form = new FormData(e.currentTarget);
    try {
      const check = await fetch(
        `/api/realtime-devices/check-availability?serial=${encodeURIComponent(String(form.get("serialNumber") ?? "").trim())}`
      );
      const avail = await check.json();
      if (avail.exists && !avail.mine) {
        toast("error", "Serial already linked to another workspace");
        return;
      }
      const res = await fetch("/api/realtime-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          serialNumber: form.get("serialNumber"),
          productName: form.get("productName"),
          protocol: form.get("protocol"),
          ipAddress: form.get("ipAddress"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.device) {
        toast("error", data.error ?? "Failed to add device");
        return;
      }
      setNewKey(data.device.apiKey ?? null);
      try {
        if (data.device.apiKey) await navigator.clipboard.writeText(String(data.device.apiKey));
      } catch {
        /* clipboard unavailable */
      }
      toast("success", `${data.device.name} added — API key copied, paste it into the machine`);
      setDevices((prev) => [
        ...prev,
        {
          id: data.device.id,
          name: data.device.name,
          serialNumber: data.device.serialNumber,
          productName: data.device.productName ?? null,
          protocol: data.device.protocol,
          capabilities: Array.isArray(data.device.capabilities) ? data.device.capabilities : [],
          ipAddress: data.device.ipAddress ?? null,
          status: data.device.status,
          lastSeenAt: null,
          linkedCount: 0,
          logCount: 0,
          createdAt: new Date(data.device.createdAt),
        },
      ]);
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function runCommand(id: string, action: string, successMsg: string, extra?: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/realtime-devices/${id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (res.ok && data.queued) toast("success", successMsg);
      else toast("error", data.error ?? "Command failed");
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function openLogs(d: RealtimeRow) {
    setLogsFor(d);
    setLogs([]);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/realtime-devices/${d.id}/logs?limit=100`);
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      toast("error", "Could not load logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function saveLinks() {
    if (!linkFor) return;
    try {
      const res = await fetch(`/api/realtime-devices/${linkFor.id}/sync-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_device_ids: linkSel }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save links");
        return;
      }
      toast("success", "Linked devices updated");
      setDevices((prev) => prev.map((x) => (x.id === linkFor.id ? { ...x, linkedCount: linkSel.length } : x)));
      setLinkFor(null);
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function rotateKey(d: RealtimeRow) {
    try {
      const res = await fetch(`/api/realtime-devices/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateApiKey: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.device?.apiKey) {
        toast("error", data.error ?? "Failed to rotate key");
        return;
      }
      try {
        await navigator.clipboard.writeText(String(data.device.apiKey));
      } catch {
        /* ignore */
      }
      toast("success", "New API key copied — update the machine, old key stops working immediately");
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function doRemoveDevice() {
    const d = confirmDelete;
    if (!d) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/realtime-devices/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("error", "Failed to delete device");
        return;
      }
      toast("success", `${d.name} deleted`);
      setDevices((prev) => prev.filter((x) => x.id !== d.id));
      setConfirmDelete(null);
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setDeleting(false);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stat("Realtime devices", devices.length, "text-foreground")}
        {stat("Online", onlineCount, "text-emerald-400")}
        {stat("Offline", devices.length - onlineCount, "text-amber-400")}
      </div>

      <div className="card-surface overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
          <div>
            <p className="text-[13.5px] font-semibold">Realtime devices</p>
            <p className="text-[12px] text-muted-foreground">
              Cloud push to{" "}
              <span className="font-mono text-[11px]">{webhookPath ?? "/api/realtime/webhook/<code>/record"}</span>{" "}
              with <span className="font-mono text-[11px]">X-API-Key</span> · poll{" "}
              <span className="font-mono text-[11px]">/api/realtime/poll</span>
            </p>
          </div>
          <Button onClick={() => { setNewKey(null); setAddOpen(true); }}>
            <Plus aria-hidden="true" className="h-4 w-4" /> Add device
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Device</TH>
                <TH className="hidden md:table-cell">Protocol</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Links</TH>
                <TH>Logs</TH>
                <TH className="hidden lg:table-cell">Last seen</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {devices.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-12 text-center">
                    <Fingerprint className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-[13.5px] font-medium">No Realtime devices yet</p>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      Add a Pro1100B / F500-class unit with its serial — an API key is issued for the machine.
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
                          <p className="truncate text-[13.5px] font-semibold">
                            {d.name}
                            {d.productName && <span className="ml-1.5 font-normal text-muted-foreground">· {d.productName}</span>}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">{d.serialNumber}</p>
                          {d.capabilities.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">{d.capabilities.join(" · ")}</p>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">{d.protocol}</TD>
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
                        {d.status === "inactive" ? <Monitor className="h-3 w-3" /> : online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {d.status === "inactive" ? "Inactive" : online ? "Online" : "Offline"}
                      </span>
                    </TD>
                    <TD className="hidden text-[13px] text-muted-foreground md:table-cell">{d.linkedCount}</TD>
                    <TD className="text-[13px] text-muted-foreground">{d.logCount}</TD>
                    <TD className="hidden text-[12.5px] text-muted-foreground lg:table-cell">
                      {d.lastSeenAt ? formatDateTime(new Date(d.lastSeenAt)) : "Never"}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <button aria-label={`View logs for ${d.name}`} title="View logs" onClick={() => openLogs(d)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                          <ScrollText aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button aria-label={`Link ${d.name}`} title="Link devices"
                          onClick={() => { setLinkSel([]); setLinkFor(d); }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                          <Link2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button aria-label={`Sync clock for ${d.name}`} title="Sync device clock"
                          onClick={() => runCommand(d.id, "sync_time", "Time-sync queued")}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                          <Clock aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button aria-label={`Reboot ${d.name}`} title="Reboot device"
                          onClick={() => runCommand(d.id, "reboot", "Reboot queued")}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                          {d.status === "inactive" ? <RotateCcw aria-hidden="true" className="h-4 w-4" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                        </button>
                        <button aria-label={`Rotate key for ${d.name}`} title="Rotate API key"
                          onClick={() => rotateKey(d)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground">
                          <KeyRound aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button aria-label={`Delete ${d.name}`} title="Delete device"
                          onClick={() => setConfirmDelete(d)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-300 transition-colors hover:bg-rose-500/10">
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Realtime device"
        description="WSS / FK-Web cloud unit — an X-API-Key is issued to paste into the machine"
      >
        <form onSubmit={addDevice} className="space-y-4">
          <Field label="Device name">
            <Input name="name" required placeholder="Delhi office — Realtime" />
          </Field>
          <Field label="Serial number" hint="Sticker / Menu → System Info, e.g. RSS2025...">
            <Input name="serialNumber" required placeholder="Device serial number" className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Protocol">
              <select name="protocol" defaultValue="wss"
                className="h-10 w-full appearance-none rounded-xl border border-input bg-card-2 px-3.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40">
                <option value="wss">WebSocket (wss)</option>
                <option value="fkweb">FK-Web HTTP</option>
              </select>
            </Field>
            <Field label="Model (optional)">
              <Input name="productName" placeholder="Pro1100B" />
            </Field>
          </div>
          <Field label="IP address (optional)">
            <Input name="ipAddress" placeholder="192.168.1.50" className="font-mono" />
          </Field>
          {newKey && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <p className="text-[12px] font-semibold text-emerald-300">API key — copy now, shown once</p>
              <p className="mt-1 break-all font-mono text-[12px] text-foreground">{newKey}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Add device</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(linkFor)}
        onClose={() => setLinkFor(null)}
        title={`Link ${linkFor?.name ?? ""}`}
        description="Linked devices share enroll data automatically"
      >
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {devices.filter((x) => x.id !== linkFor?.id).length === 0 && (
            <p className="py-4 text-center text-[13px] text-muted-foreground">No other Realtime devices to link.</p>
          )}
          {devices.filter((x) => x.id !== linkFor?.id).map((x) => (
            <label key={x.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-edge bg-tint px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={linkSel.includes(x.id)}
                onChange={() => setLinkSel((s) => (s.includes(x.id) ? s.filter((y) => y !== x.id) : [...s, x.id]))}
                className="h-4 w-4"
              />
              <span className="text-[13px] font-medium">{x.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{x.serialNumber}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={() => setLinkFor(null)}>Cancel</Button>
          <Button type="button" onClick={saveLinks}>Save links</Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(logsFor)}
        onClose={() => setLogsFor(null)}
        title={`${logsFor?.name ?? ""} — realtime logs`}
        description="Immutable cloud records; punches reconcile into the same attendance"
        size="lg"
      >
        {loadingLogs ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">Loading logs…</p>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">No logs received yet.</p>
        ) : (
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-tint px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-foreground">{l.userId ?? "—"}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{l.rawData || l.error || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11.5px] text-muted-foreground">{l.punchTime ? formatDateTime(new Date(l.punchTime)) : "—"}</p>
                  <span className={cn("text-[10.5px] font-medium",
                    l.error ? "text-amber-400" : l.processed ? "text-emerald-400" : "text-muted-foreground")}>
                    {l.error ? "flag" : l.processed ? "processed" : "pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete ${confirmDelete?.name ?? "device"}?`}
        description="Its realtime logs will be removed too. This can't be undone."
        confirmLabel="Delete device"
        busy={deleting}
        onCancel={() => !deleting && setConfirmDelete(null)}
        onConfirm={doRemoveDevice}
      />
    </>
  );
}
