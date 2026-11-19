"use client";

import { Switch } from "@/components/ui/switch";

import { useState, type FormEvent } from "react";
import { MessageSquareText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const TEMPLATES: { key: string; label: string; sample: string }[] = [
  { key: "leave.approved", label: "Leave approved", sample: "✅ Your leave request from {from} to {to} has been APPROVED by {admin}." },
  { key: "leave.rejected", label: "Leave rejected", sample: "ℹ️ Your leave request from {from} to {to} was not approved. Reason: {reason}." },
  { key: "exit.approved", label: "Exit approved", sample: "📋 Your resignation is approved. Last working day: {lwd}. Final settlement: ₹{amount}." },
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
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const changed = enabled !== saved.enabled || apiUrl.trim() !== saved.apiUrl || Boolean(token.trim()) || sender.trim() !== saved.sender;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiUrl, apiToken: token, sender }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.config) throw new Error(data?.error ?? "Could not save gateway settings.");
      setSaved(data.config);
      setApiUrl(data.config.apiUrl);
      setSender(data.config.sender);
      setToken("");
      toast("success", "WhatsApp gateway settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save gateway settings.");
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

        <form className="space-y-4" onSubmit={save}>
          <Field label="API URL" hint="e.g. https://your-gateway.example.com/whatsapp/send">
            <Input
              value={apiUrl}
              type="url"
              required={enabled}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://…"
              className="h-11 font-mono"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API token" hint={saved.hasToken ? "Leave blank to keep the saved token." : "Bearer token for the gateway"}>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={saved.hasToken ? "••••••••" : "Enter token"}
                autoComplete="new-password"
                className="h-11"
              />
            </Field>
            <Field label="Sender ID / name" hint="Optional — some providers require it">
              <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="PeopleNexa" className="h-11" />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3.5">
            <div>
              <p id="wa-enable-label" className="text-[13.5px] font-medium">Enable WhatsApp notifications</p>
              <p className="text-[12px] text-muted-foreground">
                Alerts go to employee phones on file (10-digit Indian numbers auto-prefixed with 91).
              </p>
            </div>
            <Switch
              checked={enabled}
              aria-labelledby="wa-enable-label"
              onCheckedChange={setEnabled}
            />
          </div>

          {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error}</p>}
          <Button type="submit" loading={saving} disabled={!changed}>
            <Save className="h-4 w-4" /> Save gateway
          </Button>
        </form>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Automatic messages</h2>
          <p className="mt-1 text-xs text-muted-foreground">PeopleNexa sends these messages when the corresponding request is decided. Delivery is best effort.</p>
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
