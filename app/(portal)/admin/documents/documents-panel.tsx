"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, AlertTriangle, CalendarX2, Plus, Trash2, Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { toDateKey } from "@/lib/dates";

type Doc = {
  id: string;
  name: string;
  docType: string;
  number: string | null;
  expiryDate: string | null;
  issuedDate: string | null;
  notes: string | null;
  status: "none" | "expired" | "expiring" | "ok";
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

const tone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  expired: "danger",
  expiring: "warning",
  ok: "success",
  none: "neutral",
};

export function DocumentsPanel({
  documents,
  employees,
  summary,
}: {
  documents: Doc[];
  employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[];
  summary: { total: number; expired: number; expiring: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Doc | null>(null);

  const [form, setForm] = useState({ employeeId: "", name: "", docType: "passport", number: "", expiryDate: "", notes: "" });

  const sorted = useMemo(
    () => [...documents].sort((a, b) => (a.status === b.status ? 0 : a.status === "expired" ? -1 : b.status === "expired" ? 1 : a.status === "expiring" ? -1 : 1)),
    [documents]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      toast("success", "Document added.");
      setAdding(false);
      setForm({ employeeId: "", name: "", docType: "passport", number: "", expiryDate: "", notes: "" });
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this document record?")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("success", "Deleted.");
      router.refresh();
    } else {
      toast("error", "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {summary.expired > 0 && (
            <span className="mr-3 inline-flex items-center gap-1 text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {summary.expired} expired
            </span>
          )}
          {summary.expiring > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <CalendarX2 className="h-3.5 w-3.5" /> {summary.expiring} expiring soon
            </span>
          )}
          {summary.expired === 0 && summary.expiring === 0 && <span>All {summary.total} documents up to date</span>}
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add document
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total documents</p><p className="text-2xl font-bold">{summary.total}</p></CardHeader></Card>
        <Card><CardHeader><p className="text-[11px] uppercase tracking-wider text-rose-300">Expired</p><p className="text-2xl font-bold text-rose-300">{summary.expired}</p></CardHeader></Card>
        <Card><CardHeader><p className="text-[11px] uppercase tracking-wider text-amber-300">Expiring ≤ 60 days</p><p className="text-2xl font-bold text-amber-300">{summary.expiring}</p></CardHeader></Card>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No documents yet" description="Track passports, visas, Aadhaar cards and more — with expiry alerts." />
      ) : (
        <div className="divide-y divide-white/[0.04] rounded-2xl border border-edge bg-card">
          {sorted.map((d) => (
            <div key={d.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <button onClick={() => setViewing(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint text-[11px] font-bold text-muted-foreground">
                  {d.docType.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{d.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {d.employee.firstName} {d.employee.lastName} · {d.docType}
                    {d.number ? ` · ${"•".repeat(Math.min(d.number.length, 4))}${d.number.slice(-4)}` : ""}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3">
                {d.expiryDate && (
                  <span className={`font-mono text-[12.5px] ${d.status === "expired" ? "text-rose-300" : d.status === "expiring" ? "text-amber-300" : "text-muted-foreground"}`}>
                    {toDateKey(new Date(d.expiryDate))}
                  </span>
                )}
                <Badge tone={tone[d.status] ?? "neutral"} className="capitalize">{d.status}</Badge>
                <Button size="icon" variant="ghost" onClick={() => setViewing(d)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(d.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add document" size="md">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Employee</span>
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Type</span>
              <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                {["passport", "visa", "aadhaar", "pan", "license", "other"].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Document name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Passport" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Document number</span>
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Masked in views" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Expiry date</span>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Notes</span>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Add document</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name} size="sm">
        {viewing && (
          <div className="space-y-3 text-[13px]">
            <p className="text-muted-foreground">{viewing.employee.firstName} {viewing.employee.lastName} · {viewing.docType}</p>
            {viewing.number && <p className="font-mono">••••{viewing.number.slice(-4)}</p>}
            {viewing.expiryDate && <p>Expires: <span className="font-mono">{toDateKey(new Date(viewing.expiryDate))}</span></p>}
            {viewing.notes && <p className="text-muted-foreground">{viewing.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
