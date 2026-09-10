"use client";

import { useState, type FormEvent } from "react";
import { Building2, KeyRound, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

type Branch = { id: string; name: string; code: string; locationId: string | null };
type Location = { id: string; name: string; code: string; branches: Pick<Branch, "id" | "name" | "code">[]; managers: { id: string; firstName: string; lastName: string; email: string }[] };

export function LocationsManager({ locations, branches }: { locations: Location[]; branches: Branch[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [loginFor, setLoginFor] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const branchIds = branches.filter((branch) => form.get(`branch-${branch.id}`) === "on").map((branch) => branch.id);
    setBusy(true);
    try {
      const payload = { name: form.get("name"), code: form.get("code"), branchIds };
      const res = await fetch(editing === "new" ? "/api/locations" : `/api/locations/${editing?.id}`, { method: editing === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast("error", data.error ?? "Could not save location.");
      // A newly created location needs its branches assigned after it has an id.
      if (editing === "new" && branchIds.length) await fetch(`/api/locations/${data.location.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchIds }) });
      toast("success", editing === "new" ? "Location created" : "Location updated");
      setEditing(null); router.refresh();
    } finally { setBusy(false); }
  }

  async function addLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!loginFor || busy) return;
    setBusy(true); const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/locations/${loginFor.id}/logins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast("error", data.error ?? "Could not create login.");
      toast("success", "Location login created"); setLoginFor(null); router.refresh();
    } finally { setBusy(false); }
  }

  async function deactivateLogin(locationId: string, employeeId: string) {
    if (busy) return; setBusy(true);
    try {
      const res = await fetch(`/api/locations/${locationId}/logins?employeeId=${employeeId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast("error", data.error ?? "Could not deactivate login.");
      toast("success", "Location login deactivated"); router.refresh();
    } finally { setBusy(false); }
  }

  return <>
    <div className="flex items-center justify-between border-b border-edge px-5 py-3"><p className="text-[13px] text-muted-foreground">{locations.length} locations · branch assignment and access are managed here</p><Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> New location</Button></div>
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      {locations.map((location) => <section key={location.id} className="card-surface rounded-xl p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="font-display text-[16px] font-semibold"><MapPin className="mr-1.5 inline h-4 w-4 text-primary" />{location.name}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{location.code}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${location.name}`} onClick={() => setEditing(location)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" aria-label={`Delete ${location.name}`} onClick={() => setDeleting(location)}><Trash2 className="h-3.5 w-3.5 text-rose-400" /></Button></div></div>
        <div className="mt-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Branches ({location.branches.length})</p><div className="mt-2 flex flex-wrap gap-1.5">{location.branches.length ? location.branches.map((branch) => <span key={branch.id} className="rounded-md bg-tint px-2 py-1 text-[12px]"><Building2 className="mr-1 inline h-3 w-3" />{branch.name}</span>) : <span className="text-[12px] text-muted-foreground">No branches assigned</span>}</div></div>
        <div className="mt-4 border-t border-edge pt-3"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location logins ({location.managers.length}/4)</p>{location.managers.length < 4 && <Button size="sm" variant="outline" onClick={() => setLoginFor(location)}><KeyRound className="h-3.5 w-3.5" /> Add login</Button>}</div><div className="mt-2 space-y-1.5">{location.managers.length ? location.managers.map((manager) => <div key={manager.id} className="flex items-center justify-between rounded-lg bg-tint px-2.5 py-2 text-[12px]"><span className="min-w-0 truncate">{manager.firstName} {manager.lastName} · <span className="text-muted-foreground">{manager.email}</span></span><button className="ml-2 text-rose-400 disabled:opacity-50" disabled={busy} onClick={() => deactivateLogin(location.id, manager.id)}>Deactivate</button></div>) : <p className="text-[12px] text-muted-foreground">No shared location access yet.</p>}</div></div>
      </section>)}
    </div>
    <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New location" : `Edit ${editing?.name ?? "location"}`} size="md"><form onSubmit={save} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Location name"><Input name="name" required defaultValue={editing === "new" ? "" : editing?.name} /></Field><Field label="Location code"><Input name="code" required defaultValue={editing === "new" ? "" : editing?.code} className="uppercase" /></Field></div><fieldset><legend className="mb-2 text-[12px] font-medium">Assigned branches</legend><div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-edge p-3 sm:grid-cols-2">{branches.map((branch) => <label key={branch.id} className="flex items-center gap-2 text-[12.5px]"><input name={`branch-${branch.id}`} type="checkbox" defaultChecked={editing !== "new" && editing?.branches.some((item) => item.id === branch.id)} /> {branch.name} <span className="text-muted-foreground">({branch.code})</span></label>)}</div></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={busy}>Save location</Button></div></form></Modal>
    <Modal open={loginFor !== null} onClose={() => setLoginFor(null)} title={loginFor ? `Add login · ${loginFor.name}` : "Add location login"} description="This account can access every branch assigned to this location." size="sm"><form onSubmit={addLogin} className="space-y-3"><Field label="Name"><Input name="name" required /></Field><Field label="Email"><Input name="email" type="email" required /></Field><Field label="Temporary password" hint="At least 12 characters"><Input name="password" type="password" minLength={12} required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setLoginFor(null)}>Cancel</Button><Button type="submit" loading={busy}>Create login</Button></div></form></Modal>
    <ConfirmDialog open={deleting !== null} title="Delete location?" description={deleting ? `Delete ${deleting.name}? It must have no assigned branches or active location logins.` : ""} confirmLabel="Delete" busy={busy} onCancel={() => setDeleting(null)} onConfirm={async () => { if (!deleting) return; setBusy(true); try { const res = await fetch(`/api/locations/${deleting.id}`, { method: "DELETE" }); const data = await res.json().catch(() => ({})); if (!res.ok) return toast("error", data.error ?? "Could not delete location."); toast("success", "Location deleted"); setDeleting(null); router.refresh(); } finally { setBusy(false); } }} />
  </>;
}
