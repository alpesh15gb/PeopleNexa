"use client";

import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function EssLoginAccess({ employeeId, existing }: { employeeId: string; existing?: boolean }) {
  const fieldId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<{ employeeNumber: string; temporaryPassword: string } | null>(null);
  const [issued, setIssued] = useState(false);
  const resetting = Boolean(existing || issued);

  async function create() {
    if (busy) return;
    if (customPassword && new TextEncoder().encode(customPassword).length > 72) {
      setError("Use a temporary password of at most 72 bytes.");
      return;
    }
    if (existing !== false || issued) {
      if (!window.confirm("This issues a new temporary password and signs the employee out of existing sessions. Continue?")) return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/ess-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword: customPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not issue sign-in credentials.");
        return;
      }
      setIssued(true);
      setCredentials(data);
      setCustomPassword("");
      setShowPassword(false);
    } catch {
      setError("Could not confirm whether credentials were issued. Check the employee’s sign-in status before trying again.");
    } finally {
      setBusy(false);
    }
  }

  if (credentials) return (
    <section className="space-y-3 rounded-xl border border-edge bg-tint p-4 text-sm" aria-labelledby={`${fieldId}-issued`}>
      <h3 id={`${fieldId}-issued`} className="font-semibold" role="status">Temporary password issued</h3>
      <dl className="space-y-2">
        <div><dt className="text-xs text-muted-foreground">Employee ID</dt><dd className="break-all font-mono">{credentials.employeeNumber}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Temporary password</dt><dd className="break-all font-mono">{credentials.temporaryPassword}</dd></div>
      </dl>
      <p className="text-muted-foreground">Share the employee ID, temporary password, and your workspace sign-in link privately. This password is shown only here.</p>
      <Button type="button" variant="outline" onClick={() => setCredentials(null)}>Hide password</Button>
    </section>
  );

  return (
    <section className="space-y-3 rounded-xl border border-edge bg-card p-4" aria-labelledby={`${fieldId}-title`}>
      <h3 id={`${fieldId}-title`} className="text-sm font-semibold">Employee portal access</h3>
      <p className="text-sm text-muted-foreground">
        PeopleNexa can generate a temporary password for the employee’s ID. {resetting && "Issuing a new password ends their current sessions."}
      </p>
      <details className="rounded-lg border border-edge px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Choose a custom temporary password</summary>
        <Field htmlFor={fieldId} label="Temporary password" className="mt-2">
          <div className="flex items-center gap-2">
            <Input id={fieldId} type={showPassword ? "text" : "password"} value={customPassword} onChange={(event) => {
              setCustomPassword(event.currentTarget.value);
              setError("");
            }} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={72} disabled={busy} />
            <Button type="button" variant="outline" disabled={busy} aria-label={showPassword ? "Hide password entry" : "Show password entry"} onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Hide" : "Show"}
            </Button>
          </div>
        </Field>
      </details>
      <Button type="button" loading={busy} onClick={() => void create()}>
        <KeyRound className="size-4" aria-hidden="true" /> {customPassword ? "Issue temporary password" : "Generate temporary password"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
