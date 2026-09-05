"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

type Policy = { id: string; title: string; category: string; body: string; version: number; updatedAt: string };

const CATEGORIES = ["general", "attendance", "leave", "payroll", "conduct", "it", "safety"];

export function PoliciesPanel({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [form, setForm] = useState({ title: "", category: "general", body: "" });

  function startEdit(p?: Policy) {
    setEditing(p ?? null);
    setForm(p ? { title: p.title, category: p.category, body: p.body } : { title: "", category: "general", body: "" });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = editing
        ? await fetch(`/api/policies/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
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
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function del(id: string) {
    setConfirmTarget(id);
  }

  async function doConfirm() {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/policies/${confirmTarget}`, { method: "DELETE" });
      if (res.ok) {
        toast("success", "Policy deleted.");
        router.refresh();
      } else toast("error", "Failed");
    } finally {
      setConfirmBusy(false);
      setConfirmTarget(null);
    }
  }

  const byCategory = CATEGORIES.map((c) => ({ category: c, items: policies.filter((p) => p.category === c) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{policies.length} policies published to employees</p>
        <Button size="sm" onClick={() => startEdit()}><Plus className="h-3.5 w-3.5" /> New policy</Button>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No policies yet" description="Create company policies — attendance, leave, conduct — visible to all employees." />
      ) : (
        <div className="space-y-5">
          {byCategory.map((g) => (
            <div key={g.category}>
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{g.category}</p>
              <div className="divide-y divide-[color:var(--border)] rounded-2xl border border-edge bg-card">
                {g.items.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{p.title} <span className="ml-1 text-[11px] text-muted-foreground">v{p.version}</span></p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-muted-foreground">{p.body}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit policy" : "New policy"} size="md">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Leave policy" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Policy body</span>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={8} placeholder="Full policy text…" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? "Save changes" : "Create policy"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Delete policy?"
        description="Delete this policy? This action cannot be undone."
        confirmLabel="Delete"
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmTarget(null);
        }}
        onConfirm={doConfirm}
      />
    </div>
  );
}
