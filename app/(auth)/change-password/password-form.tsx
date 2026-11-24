"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/components/use-hydrated";

export function ChangePasswordForm({ temporary, hasChecklist }: { temporary: boolean; hasChecklist: boolean }) {
  const router = useRouter();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (new TextEncoder().encode(password).length > 72) {
      setError("Use a password of at most 72 bytes.");
      return;
    }
    if (password !== form.get("confirm")) { setError("New passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("current"), password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not change password."); return; }
      router.replace(hasChecklist && data.next === "/employee" ? "/employee/onboarding" : data.next);
      router.refresh();
    } catch { setError("Could not connect. Please try again."); } finally { setBusy(false); }
  }
  return <form method="post" onSubmit={submit} className="space-y-4">
    <Field label={temporary ? "Temporary password" : "Current password"}><Input name="current" type="password" autoComplete="current-password" required maxLength={72} /></Field>
    <Field label="New password"><Input name="password" type="password" autoComplete="new-password" minLength={1} maxLength={72} required /></Field>
    <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" minLength={1} maxLength={72} required /></Field>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={!ready} loading={busy}>{hasChecklist ? "Save and open checklist" : "Save password"}</Button>
      <Button disabled={busy} type="button" variant="ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}>Sign out</Button>
    </div>
  </form>;
}
