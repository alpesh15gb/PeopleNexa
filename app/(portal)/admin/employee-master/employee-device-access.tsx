"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Device = { id: string; name: string; serialNumber: string; allowed: boolean; commandStatus?: string; lastCommandAt?: string | null; lastError?: string | null };
type Result = { deviceId: string; name: string; allowed: boolean; status: "sent" | "failed"; error?: string };

export function EmployeeDeviceAccess({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);
    fetch(`/api/employees/${employeeId}/device-access`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not load device access.");
        if (!cancelled) {
          setDevices(data.devices ?? []);
          setSelected(data.deviceIds ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast("error", error instanceof Error ? error.message : "Could not load device access.");
          setOpen(false);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, open, toast]);

  function toggle(deviceId: string) {
    setSelected((current) => current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId]);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}/device-access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIds: selected }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) throw new Error(data.error ?? "Could not update device access.");
      const nextResults: Result[] = data.results ?? [];
      const failed = nextResults.filter((result) => result.status === "failed");
      setResults(nextResults);
      setDevices((current) => current.map((device) => {
        const result = nextResults.find((item) => item.deviceId === device.id);
        return result ? { ...device, allowed: result.allowed, commandStatus: result.status, lastError: result.error ?? null } : device;
      }));
      toast(failed.length ? "error" : "success", failed.length ? `${failed.length} device command(s) failed. Review the results below.` : "Commands sent to eBio. Confirm access physically on the device.");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not update device access.");
    } finally {
      setSaving(false);
    }
  }

  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Fingerprint className="h-3.5 w-3.5" /> Allowed devices</Button><Modal open={open} onClose={() => setOpen(false)} title="Allowed biometric devices" description="Select the active eBio devices where this employee may clock in or out.">
    {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading active devices...</div> : <div className="space-y-4">
      {devices.length ? <div className="max-h-[45vh] divide-y divide-edge overflow-y-auto rounded-xl border border-edge">{devices.map((device) => <label key={device.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-tint"><input type="checkbox" checked={selected.includes(device.id)} onChange={() => toggle(device.id)} className="mt-1 h-4 w-4 accent-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{device.name}</span><span className="block font-mono text-xs text-muted-foreground">{device.serialNumber}</span>{device.commandStatus && <span className={`mt-1 block text-xs ${device.commandStatus === "failed" ? "text-destructive" : "text-muted-foreground"}`}>Last command: {device.commandStatus}{device.lastError ? ` - ${device.lastError}` : ""}</span>}</span></label>)}</div> : <p className="rounded-xl border border-dashed border-edge p-6 text-center text-sm text-muted-foreground">No active eBio devices are available for this employee.</p>}
      {results.length > 0 && <div className="rounded-xl border border-edge bg-tint/30 p-3 text-sm"><p className="font-medium">Command results</p>{results.map((result) => <p key={result.deviceId} className={`mt-1 ${result.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{result.name}: {result.status}{result.error ? ` - ${result.error}` : ""}</p>)}</div>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button><Button type="button" onClick={save} loading={saving} disabled={!devices.length}>Save allowed devices</Button></div>
    </div>}
  </Modal></>;
}
