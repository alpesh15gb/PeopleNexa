"use client";

import { useState } from "react";
import { MessageSquareText, Save, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const TEMPLATES: { key: string; label: string; sample: string }[] = [
  { key: "leave.approved", label: "Leave approved", sample: "✅ Your leave request from {from} to {to} has been APPROVED by {admin}." },
  { key: "leave.rejected", label: "Leave rejected", sample: "ℹ️ Your leave request from {from} to {to} was not approved. Reason: {reason}." },
  { key: "exit.approved", label: "Exit approved", sample: "📋 Your resignation is approved. Last working day: {lwd}. Final settlement: ₹{amount}." },
  { key: "payslip.generated", label: "Payslip ready", sample: "🧾 Your payslip for {month} is ready. Net pay: ₹{amount}. Login to view the full statement." },
  { key: "punch.reminder", label: "Punch reminder", sample: "⏰ Reminder: you haven't clocked in yet today ({date})." },
];

export function WhatsAppPanel({
  initial,
}: {
  initial: { enabled: boolean; apiUrl: string; hasToken: boolean; sender: string };
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [token, setToken] = useState("");
  const [sender, setSender] = useState(initial.sender);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiUrl, apiToken: token, sender }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setToken("");
      toast("success", enabled ? "WhatsApp gateway enabled" : "WhatsApp notifications disabled");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-white">
            <MessageSquareText className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold">Gateway connection</h3>
            <p className="text-[12px] text-muted-foreground">
              Any provider that accepts a JSON POST (<span className="font-mono">{"{ to, message }"}</span>) with a bearer token — WhatsApp
              Business API proxy, Gupshup, or your own gateway.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="API URL" hint="e.g. https://your-gateway.example.com/whatsapp/send">
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://…"
              className="h-11 font-mono"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API token" hint={initial.hasToken ? "Saved — leave blank to keep" : "Bearer token for the gateway"}>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={initial.hasToken ? "••••••••" : "Enter token"}
                autoComplete="new-password"
                className="h-11"
              />
            </Field>
            <Field label="Sender ID / name" hint="Optional — some providers require it">
              <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="PeopleNexa" className="h-11" />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3.5">
            <div>
              <p className="text-[13.5px] font-medium">Enable WhatsApp notifications</p>
              <p className="text-[12px] text-muted-foreground">
                Alerts go to employee phones on file (10-digit Indian numbers auto-prefixed with 91).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-gradient-brand" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>

          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save gateway
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Zap className="h-4 w-4 text-amber-400" /> What gets sent
          </div>
          <ul className="mt-3 space-y-2 text-[12.5px] text-muted-foreground">
            <li>• Leave approved / rejected</li>
            <li>• Payslip ready after payroll run</li>
            <li>• Resignation approved + final settlement</li>
            <li>• Punch reminders (future — scheduled job)</li>
          </ul>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-edge bg-tint px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Delivery is best-effort and never blocks payroll or approvals. Failed sends are silently skipped.
          </div>
        </div>

        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold">Message templates</div>
          <div className="mt-3 space-y-3">
            {TEMPLATES.map((t) => (
              <div key={t.key} className="rounded-xl border border-edge bg-tint px-3.5 py-2.5">
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
                <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-muted-foreground/90">{t.sample}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
