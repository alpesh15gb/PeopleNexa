"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Link from "next/link";

type Policy = { id: string; title: string; category: string; body: string; version: number; active: boolean; updatedAt: string };

const CATEGORIES = ["general", "attendance", "leave", "payroll", "conduct", "it", "safety"];

export function PoliciesPanel({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Policy | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [form, setForm] = useState({ title: "", category: "general", body: "" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("published");
  const [error, setError] = useState("");

  function startEdit(p?: Policy) {
    setError("");
    setEditing(p ?? null);
    setForm(p ? { title: p.title, category: p.category, body: p.body } : { title: "", category: "general", body: "" });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = editing
        ? await fetch(`/api/policies/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, expectedUpdatedAt: editing.updatedAt }),
          })
        : await fetch("/api/policies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", editing ? "Policy updated." : "Policy created.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the policy.");
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/policies/${confirmTarget.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !confirmTarget.active, expectedUpdatedAt: confirmTarget.updatedAt }),
      });
      if (res.ok) {
        toast("success", confirmTarget.active ? "Policy archived." : "Policy published.");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast("error", data.error ?? "Could not change policy visibility.");
      }
    } catch {
      toast("error", "Could not change policy visibility. Try again.");
    } finally {
      setConfirmBusy(false);
      setConfirmTarget(null);
    }
  }

  const categories = [...new Set([...CATEGORIES, ...policies.map((policy) => policy.category)])];
  const matches = policies.filter((policy) => (status === "all" || policy.active === (status === "published")) && `${policy.title} ${policy.body}`.toLowerCase().includes(query.trim().toLowerCase()));
  const byCategory = categories.map((category) => ({ category, items: matches.filter((policy) => policy.category === category) })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Company policies" description="Publish policies for employees and archive superseded guidance." actions={<Button size="sm" onClick={() => startEdit()}><Plus aria-hidden="true" className="h-3.5 w-3.5" /> New policy</Button>} />
      {policies.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-card p-3">
        <Input aria-label="Search policies" placeholder="Search title or policy text" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" />
        <Select aria-label="Policy status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto"><option value="published">Published</option><option value="archived">Archived</option><option value="all">All policies</option></Select>
        <Link href="/employee/policies" className="px-2 text-sm font-medium text-primary hover:underline">View employee library</Link>
      </div>}

      {matches.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title={policies.length ? "No matching policies" : "No policies yet"} description={policies.length ? "Change the search or publication status." : "Publish your first policy to the employee library."} />
      ) : (
        <div className="space-y-5">
          {byCategory.map((g) => (
            <div key={g.category}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{g.category}</h2>
              <div className="divide-y divide-[color:var(--border)] rounded-2xl border border-edge bg-card">
                {g.items.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13.5px] font-medium">{p.title} <span className="ml-1 text-[11px] text-muted-foreground">v{p.version} · {p.active ? "Published" : "Archived"}</span></p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-muted-foreground">{p.body}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`${p.active ? "Archive" : "Publish"} ${p.title}`} onClick={() => setConfirmTarget(p)}>{p.active ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={editing ? "Edit policy" : "New policy"} size="md">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Leave policy" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                {categories.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Policy body</span>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={8} placeholder="Full policy text…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? "Save changes" : "Publish policy"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={confirmTarget?.active ? "Archive policy?" : "Publish policy?"}
        description={confirmTarget?.active ? "Employees will no longer see it. HR can edit or publish it again." : "Employees will be able to read it in the policy library."}
        confirmLabel={confirmTarget?.active ? "Archive" : "Publish"}
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmTarget(null);
        }}
        onConfirm={doConfirm}
      />
    </div>
  );
}
