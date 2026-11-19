"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Trash2,
  Clock,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { deviceHealthState, deviceStatusMetadata, type DeviceHealthState } from "@/lib/device-health";
import { DeviceStatusBadge, DeviceStatusLegend } from "@/components/devices/device-status";
import { useRouteAction } from "@/components/use-route-action";
import { cn } from "@/lib/utils";

export interface DeviceRow {
  id: string;
  name: string;
  serialNumber: string;
  branchName: string | null;
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

export function DevicesPanel({ rows, branches, requireBranch }: { rows: DeviceRow[]; branches: Array<{ id: string; name: string }>; requireBranch: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [devices, setDevices] = useState(rows);
  const [addOpen, setAddOpen] = useRouteAction("add");
  const nameField = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [logsFor, setLogsFor] = useState<DeviceRow | null>(null);
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DeviceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | DeviceHealthState>("all");
  const [query, setQuery] = useState("");
  const [confirmStatus, setConfirmStatus] = useState<DeviceRow | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const canAdd = !requireBranch || branches.length > 0;
  useEffect(() => { setDevices(rows); }, [rows]);

  const now = Date.now();
  const stateOf = (d: DeviceRow) => deviceHealthState(d.status, d.lastSeenAt ? new Date(d.lastSeenAt) : null, now);
  const search = query.trim().toLowerCase();
  const visibleDevices = devices
    .filter((d) => statusFilter === "all" || stateOf(d) === statusFilter)
    .filter((d) => `${d.name} ${d.serialNumber} ${d.branchName ?? ""}`.toLowerCase().includes(search))
    .sort((a, b) => stateOf(a).localeCompare(stateOf(b)) || a.name.localeCompare(b.name));

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
          branchId: form.get("branchId") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.device) {
        toast("error", data.error ?? "Failed to add device");
        return;
      }
      toast("success", `${data.device.name} added — point the device at /iclock/cdata?SN=${data.device.serialNumber}`);
      setDevices((prev) => [...prev, { ...data.device, branchName: branches.find(({ id }) => id === data.device.branchId)?.name ?? null, lastSeenAt: null, logCount: 0 }]);
      setAddOpen(false);
      router.refresh();
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
      if (res.ok && (data.queued || data.success)) {
        toast("success", successMsg);
      } else {
        toast("error", data.error ?? "Command failed");
      }
    } catch {
      toast("error", "Something went wrong.");
    }
  }

  async function removeDevice(d: DeviceRow) {
    setConfirmDelete(d);
  }

  async function changeStatus(device: DeviceRow) {
    const nextStatus = device.status === "inactive" ? "active" : "inactive";
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update device status.");
      setDevices((current) => current.map((row) => row.id === device.id ? { ...row, status: data.device.status } : row));
      setConfirmStatus(null);
      toast("success", nextStatus === "active" ? "Device re-enabled." : "Device disabled.");
      router.refresh();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not update device status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function doRemoveDevice() {
    const d = confirmDelete;
    if (!d) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast("error", data?.error ?? "Failed to delete device.");
        return;
      }
      toast("success", `${d.name} deleted`);
      setDevices((prev) => prev.filter((x) => x.id !== d.id));
      setConfirmDelete(null);
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  async function openLogs(d: DeviceRow) {
    setLogsFor(d);
    setLogs([]);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/devices/${d.id}/logs?limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load logs.");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      toast("error", "Could not load logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  return (
    <>
      <div className="card-surface overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
           <div>
            <h2 className="text-base font-semibold">Registered direct devices</h2>
            <p className="text-[12px] text-muted-foreground">
              Devices push punches to <span className="font-mono text-[11px]">/iclock/cdata?SN=…</span>
            </p>
            <DeviceStatusLegend />
           </div>
           <Input type="search" aria-label="Search direct devices" placeholder="Name, serial or branch" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full sm:w-60" />
           <label className="text-[12px] text-muted-foreground">
             <span className="sr-only">Filter devices by status</span>
             <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | DeviceHealthState)} className="h-9 rounded-lg border border-edge bg-tint px-2 text-foreground">
               <option value="all">All statuses</option><option value="online">Online</option><option value="idle">Idle</option><option value="stale">Stale</option><option value="offline">Offline</option><option value="disabled">Admin disabled</option>
             </select>
           </label>
          <Button onClick={() => setAddOpen(true)} disabled={!canAdd}>
            <Plus aria-hidden="true" className="h-4 w-4" /> Add device
          </Button>
        </div>
        {!canAdd && <p className="border-b border-edge px-5 py-3 text-sm text-muted-foreground">Assign a branch to this location before registering a device.</p>}

        <div className="overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Device</TH>
              <TH className="hidden md:table-cell">Type</TH>
              <TH className="hidden md:table-cell">IP address</TH>
              <TH>Status</TH>
              <TH>Logs</TH>
              <TH className="hidden lg:table-cell">Last seen</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {visibleDevices.length === 0 && (
              <TR>
                <TD colSpan={7} className="py-12 text-center">
                  <Fingerprint className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-[13.5px] font-medium">{devices.length === 0 ? "No direct devices yet" : "No devices match these filters"}</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {devices.length === 0 ? "Register an ESSL or ZKTeco device with its serial number to receive punches." : "Change the search or status filter."}
                  </p>
                </TD>
              </TR>
            )}
            {visibleDevices.map((d) => {
               const state = stateOf(d);
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
                        <p className="text-xs text-muted-foreground">{d.branchName ?? "No branch assigned"}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden capitalize text-[13px] md:table-cell">{d.type}</TD>
                  <TD className="hidden font-mono text-[12px] text-muted-foreground md:table-cell">{d.ipAddress || "—"}</TD>
                  <TD>
                    <DeviceStatusBadge state={state} />
                  </TD>
                  <TD className="text-[13px] text-muted-foreground">{d.logCount}</TD>
                  <TD className="hidden text-[12.5px] text-muted-foreground lg:table-cell">
                      {d.lastSeenAt ? `${formatDateTime(d.lastSeenAt)} IST` : deviceStatusMetadata(state)}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                       <button
                        aria-label={`View logs for ${d.name}`}
                        title="View logs"
                        onClick={() => openLogs(d)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <ScrollText aria-hidden="true" className="h-4 w-4" />
                      </button>
                       {d.status !== "inactive" && <button
                        aria-label={`Sync attendance logs for ${d.name}`}
                        title="Sync attendance logs"
                        onClick={() => runCommand(d.id, "sync", "Sync command queued")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <RefreshCw aria-hidden="true" className="h-4 w-4" />
                       </button>}
                       {d.status !== "inactive" && <button
                        aria-label={`Reboot ${d.name}`}
                        title="Reboot device"
                        onClick={() => runCommand(d.id, "reboot", "Reboot command queued")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                       </button>}
                       {d.status !== "inactive" && <button
                        aria-label={`Sync clock for ${d.name}`}
                        title="Sync device clock"
                        onClick={() => runCommand(d.id, "set_time", "Time-sync command queued")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      >
                        <Clock aria-hidden="true" className="h-4 w-4" />
                       </button>}
                       <button
                        aria-label={`${d.status === "inactive" ? "Re-enable" : "Disable"} ${d.name}`}
                        title={d.status === "inactive" ? "Re-enable device" : "Disable device"}
                        onClick={() => setConfirmStatus(d)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
                      ><Power aria-hidden="true" className="h-4 w-4" /></button>
                       <button
                        aria-label={`Delete ${d.name}`}
                        title="Delete device"
                        onClick={() => removeDevice(d)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-300 transition-colors hover:bg-rose-500/10"
                      >
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

      {/* Add device */}
      <Modal
        open={addOpen && canAdd}
        onClose={() => !saving && setAddOpen(false)}
        title="Add biometric device"
        description="ESSL / ZKTeco ADMS device — enter the serial number printed on the unit"
        initialFocus={nameField}
      >
        <form onSubmit={addDevice} className="space-y-4">
          <Field label="Device name">
            <Input ref={nameField} name="name" required placeholder="Main entrance" />
          </Field>
          <Field label="Serial number" hint="Printed on the device, e.g. ESQ3001...">
            <Input name="serialNumber" required placeholder="Device serial number" className="font-mono" />
          </Field>
          {branches.length > 0 && (
            <Field label="Branch" hint={requireBranch ? "Device must belong to a branch in your location" : "Assign this device to a branch"}>
              <select
                name="branchId"
                required={requireBranch}
                className="h-10 w-full appearance-none rounded-xl border border-input bg-card-2 px-3.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
                defaultValue=""
              >
                <option value="">{requireBranch ? "Select branch" : "No branch"}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          )}
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

      <ConfirmDialog
        open={confirmStatus !== null}
        title={`${confirmStatus?.status === "inactive" ? "Re-enable" : "Disable"} ${confirmStatus?.name ?? "device"}?`}
        description={confirmStatus?.status === "inactive" ? "The device can send punches again when it reconnects." : "The workspace stops accepting punches from this device. Recorded attendance and logs stay available."}
        confirmLabel={confirmStatus?.status === "inactive" ? "Re-enable device" : "Disable device"}
        tone={confirmStatus?.status === "inactive" ? "success" : "danger"}
        busy={updatingStatus}
        onCancel={() => !updatingStatus && setConfirmStatus(null)}
        onConfirm={() => confirmStatus && changeStatus(confirmStatus)}
      />
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`Delete ${confirmDelete?.name ?? "device"}?`}
        description="Remove this registration. Devices with punch, log or command history can be disabled instead."
        confirmLabel="Delete device"
        busy={deleting}
        onCancel={() => !deleting && setConfirmDelete(null)}
        onConfirm={doRemoveDevice}
      />
    </>
  );
}
