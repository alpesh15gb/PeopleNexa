"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function EssLoginAccess({ employeeId }: { employeeId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<{ employeeNumber: string; temporaryPassword: string } | null>(null);
  async function create() {
    if (busy) return;
    if (temporaryPassword && (temporaryPassword.length < 12 || new TextEncoder().encode(temporaryPassword).length > 72)) { setError("Use a temporary password of at least 12 characters and at most 72 bytes."); return; }
    if (!window.confirm("Create or reset this employee's ESS login? Existing sessions will be signed out and the employee must change the temporary password.")) return;
    setBusy(true); setError(""); setCredentials(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/ess-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ temporaryPassword }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create ESS login."); return; }
      setCredentials(data); setTemporaryPassword(""); setShowPassword(false);
    } catch { setError("Could not connect. Please try again."); } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-lg border border-edge p-3">
    <p className="text-sm font-semibold">ESS login</p>
    <p className="text-xs text-muted-foreground">Employee ID sign-in. Real email is preserved; an internal address is generated if needed. The employee must change the temporary password.</p>
    <Field label="Temporary password" hint="Enter your chosen password (minimum 12 characters), or leave blank to generate one automatically.">
      <div className="flex items-center gap-2">
        <Input type={showPassword ? "text" : "password"} value={temporaryPassword} onChange={event => { setTemporaryPassword(event.target.value); setCredentials(null); setError(""); }} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={72} disabled={busy} placeholder="Choose a temporary password" />
        <Button type="button" variant="outline" disabled={busy} aria-label={showPassword ? "Hide temporary password" : "Show temporary password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</Button>
      </div>
    </Field>
    <Button type="button" variant="outline" loading={busy} onClick={create}>Create/reset ESS login</Button>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
    {credentials && <div className="break-all text-sm" role="status"><p>Employee ID: <strong>{credentials.employeeNumber}</strong></p><p>Temporary password: <code>{credentials.temporaryPassword}</code></p><p className="text-xs">Shown only now. Share privately with this employee.</p><Button type="button" variant="outline" onClick={() => setCredentials(null)}>Hide password</Button></div>}
  </div>;
}
