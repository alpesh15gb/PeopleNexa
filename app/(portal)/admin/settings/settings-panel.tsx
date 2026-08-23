"use client";

import { useState } from "react";
import { Link2, Loader2, Plug, Save, ShieldCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";

interface InitialProfile {
  url: string;
  username: string;
  hasPassword: boolean;
  enabled: boolean;
  pollIntervalMinutes: number;
  lastPulledAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export function SettingsPanel({ initial }: { initial: InitialProfile }) {
  const toast = useToast();
  const [url, setUrl] = useState(initial.url);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [interval, setInterval] = useState(initial.pollIntervalMinutes);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [status, setStatus] = useState({
    hasPassword: initial.hasPassword,
    lastPulledAt: initial.lastPulledAt,
    lastError: initial.lastError,
    lastErrorAt: initial.lastErrorAt,
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; created: number; skipped: number; failed: number; reprocessed: number } | null>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ebioserver", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, username, password, enabled, pollIntervalMinutes: interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast("error", data.error ?? "Failed to save");
        return;
      }
      setPassword("");
      setStatus((s) => ({ ...s, hasPassword: data.profile.hasPassword }));
      toast("success", enabled ? "eBioserver connection saved" : "Settings saved — connection disabled");
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function importEmployees() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/settings/ebioserver/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        toast("error", data.error ?? data.message ?? "Import failed");
        return;
      }
      setImportResult({ total: data.total, created: data.created, skipped: data.skipped, failed: data.failed, reprocessed: data.reprocessed ?? 0 });
      toast("success", `Imported ${data.created} employees — ${data.reprocessed ?? 0} punches reconciled`);
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setImporting(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/ebioserver/test", { method: "POST" });
      const data = await res.json();
      setTestResult({ ok: Boolean(data.ok), message: data.message ?? "No response" });
    } catch {
      setTestResult({ ok: false, message: "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div id="ebioserver" className="card-surface scroll-mt-24 rounded-2xl p-6 lg:col-span-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-white">
            <Link2 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold">eBioserver Web Service</h3>
            <p className="text-[12px] text-muted-foreground">
              ESSL middleware — each client connects their own server, punches flow into attendance.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Field
            label="Web Service URL"
            hint="Use an HTTPS/public endpoint by default. Private/LAN addresses require the deployment operator to explicitly enable private integration URLs."
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://bio.example.com/Webservice.asmx"
              className="h-11 font-mono"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="essl" className="h-11" />
            </Field>
            <Field label="Password" hint={status.hasPassword ? "Saved — leave blank to keep" : "Encrypted at rest (AES-256)"}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status.hasPassword ? "••••••••" : "Enter password"}
                autoComplete="new-password"
                className="h-11"
              />
            </Field>
          </div>

          <Field label="Polling interval" hint="How often punches are pulled (minutes)">
            <Input
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="h-11 w-40"
            />
          </Field>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3.5">
            <div>
              <p className="text-[13.5px] font-medium">Enable automated pull</p>
              <p className="text-[12px] text-muted-foreground">
                The polling job will pull punches from this server on schedule.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                enabled ? "bg-gradient-brand" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  enabled ? "left-[22px]" : "left-0.5"
                )}
              />
            </button>
          </label>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save connection
          </Button>
          <Button variant="outline" onClick={test} loading={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Test connection
          </Button>
        </div>

        {testResult && (
          <p
            className={cn(
              "mt-4 rounded-xl border px-3.5 py-2.5 text-[13px]",
              testResult.ok
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-400"
                : "border-rose-400/20 bg-rose-500/10 text-rose-300"
            )}
          >
            {testResult.ok ? "✓ " : "✗ "}
            {testResult.message}
          </p>
        )}

        <div className="mt-6 rounded-xl border border-edge bg-tint p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <UserPlus className="h-4 w-4 text-brand" /> Employees from eBioserver
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Pulls the employee master (codes + names) from this server so their punches flow into attendance automatically.
            Idempotent — re-running only adds what&apos;s new. Imported employees receive a non-guessable internal credential;
            set a new portal password from the employee record before giving them login access.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={importEmployees} loading={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Import employees
            </Button>
            {importResult && (
              <p className="text-[12.5px]">
                <span className="font-semibold text-emerald-400">{importResult.created} created</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {importResult.skipped} already present · {importResult.failed} failed · of {importResult.total} codes
                  {importResult.reprocessed > 0 && ` · ${importResult.reprocessed} flagged punches reconciled`}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-6">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Connection status
          </div>
          <dl className="mt-4 space-y-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Credentials</dt>
              <dd className={cn("font-medium", status.hasPassword ? "text-emerald-400" : "text-amber-400")}>
                {status.hasPassword ? "Stored (encrypted)" : "Not set"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last successful pull</dt>
              <dd className="text-right font-medium">
                {status.lastPulledAt ? formatDateTime(new Date(status.lastPulledAt)) : "Never"}
              </dd>
            </div>
            {status.lastError && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-300">
                <p className="font-semibold">Last error {status.lastErrorAt ? `· ${formatDateTime(new Date(status.lastErrorAt))}` : ""}</p>
                <p className="mt-1 break-words">{status.lastError}</p>
              </div>
            )}
            {!status.lastError && (
              <p className="text-[12px] text-muted-foreground">
                After saving, run the polling job — it pulls from this workspace&apos;s own server and isolates failures per client.
              </p>
            )}
          </dl>
        </div>

        <div className="card-surface rounded-2xl p-6">
          <h4 className="text-[13px] font-semibold">How it works</h4>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>Enter your eBioserver Web Service URL + credentials (password encrypted).</li>
            <li>Test the connection, then enable the automated pull.</li>
            <li>Devices appear under <span className="text-foreground">Admin → Devices</span> automatically; their punches flow into attendance.</li>
            <li>Each client&apos;s server is polled in isolation — a slow or failing server only flags itself.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
