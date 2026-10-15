"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ChangePasswordForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("New passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("current"), password: form.get("password") }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not change password."); return; }
      router.replace(data.next); router.refresh();
    } catch { setError("Could not connect. Please try again."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <Field label="Current or temporary password"><Input name="current" type="password" autoComplete="current-password" required maxLength={72} /></Field>
    <Field label="New password" hint="Enter your new password (maximum 72 bytes)."><Input name="password" type="password" autoComplete="new-password" minLength={1} maxLength={72} required /></Field>
    <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" minLength={1} maxLength={72} required /></Field>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
    <Button type="submit" loading={busy}>Save password</Button>
    <Button type="button" variant="outline" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }}>Sign out</Button>
  </form>;
}
