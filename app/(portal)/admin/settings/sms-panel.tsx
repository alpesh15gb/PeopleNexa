"use client";

import { useState } from "react";
import { MessageSquareText, Save, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SmsPanel({
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
      const res = await fetch("/api/settings/sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiUrl, apiToken: token, sender }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setToken("");
      toast("success", enabled ? "SMS gateway enabled" : "SMS notifications disabled");
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
            <h3 className="font-display text-base font-semibold">SMS fallback</h3>
            <p className="text-[12px] text-muted-foreground">
              Payslip / alert fallback when WhatsApp is unreachable — any provider that accepts a JSON
              POST (<span className="font-mono">{"{ to, message }"}</span>) with a bearer token.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="API URL" hint="e.g. https://your-gateway.example.com/sms/send">
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
            <Field label="Sender ID" hint="Optional — DLT sender ID / header">
              <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="PNEXA" className="h-11" />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3.5">
            <div>
              <p id="sms-enable-label" className="text-[13.5px] font-medium">Enable SMS fallback</p>
              <p className="text-[12px] text-muted-foreground">
                Payslip-ready, success / warning / danger alerts go to employee phones on file (10-digit
                Indian numbers auto-prefixed with 91).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="sms-enable-label"
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-gradient-brand" : "bg-muted"}`}
            >
              <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

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
            <li>• Payslip-ready + payroll alerts (via in-app notifications)</li>
            <li>• Success / warning / danger employee alerts</li>
            <li>• Info notifications stay in-app only (no SMS)</li>
          </ul>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-edge bg-tint px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Delivery is best-effort and never blocks payroll or approvals. Unconfigured gateway =
            silently skipped.
          </div>
        </div>
      </div>
    </div>
  );
}
