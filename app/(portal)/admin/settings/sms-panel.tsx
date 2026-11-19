"use client";

import { Switch } from "@/components/ui/switch";

import { useState, type FormEvent } from "react";
import { MessageSquareText, Save } from "lucide-react";
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
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const changed = enabled !== saved.enabled || apiUrl.trim() !== saved.apiUrl || Boolean(token.trim()) || sender.trim() !== saved.sender;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiUrl, apiToken: token, sender }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.config) throw new Error(data?.error ?? "Could not save SMS settings.");
      setSaved(data.config);
      setApiUrl(data.config.apiUrl);
      setSender(data.config.sender);
      setToken("");
      toast("success", "SMS settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save SMS settings.");
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
            <h3 className="font-display text-base font-semibold">SMS notifications</h3>
            <p className="text-[12px] text-muted-foreground">
              Connect a provider that accepts a JSON POST with a bearer token.
            </p>
          </div>
        </div>

        <form onSubmit={save}>
        <fieldset disabled={saving} className="space-y-4">
          <Field label="API URL" hint="e.g. https://your-gateway.example.com/sms/send">
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
                required={enabled && !saved.hasToken}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={saved.hasToken ? "••••••••" : "Enter token"}
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
              <p id="sms-enable-label" className="text-[13.5px] font-medium">Enable SMS notifications</p>
              <p className="text-[12px] text-muted-foreground">
                Payslip-ready, success / warning / danger alerts go to employee phones on file (10-digit
                Indian numbers auto-prefixed with 91).
              </p>
            </div>
            <Switch
              checked={enabled}
              aria-labelledby="sms-enable-label"
              onCheckedChange={setEnabled}
            />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!changed} loading={saving}>
            <Save className="h-4 w-4" /> Save SMS gateway
          </Button>
        </fieldset>
        </form>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-5">
          <h4 className="text-sm font-semibold">When employees receive SMS</h4>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Success, warning and urgent employee alerts are sent by SMS when a phone number is on file. Informational notices stay in the app.</p>
        </div>
      </div>
    </div>
  );
}
