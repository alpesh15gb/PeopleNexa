"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, AlertTriangle, CalendarX2, Plus, Trash2, Eye, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayKey } from "@/lib/dates";
import { DOCUMENT_ATTACHMENT_MAX_BYTES, DOCUMENT_ATTACHMENT_TYPES } from "@/lib/document-attachment";

type Doc = {
  id: string;
  name: string;
  docType: string;
  number: string | null;
  expiryDate: string | null;
  issuedDate: string | null;
  updatedAt: string;
  notes: string | null;
  hasAttachment: boolean;
  status: "none" | "expired" | "expiring" | "ok";
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

const emptyForm = { employeeId: "", name: "", docType: "other", number: "", issuedDate: "", expiryDate: "", notes: "" };

function readAttachment(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the attachment."));
    reader.readAsDataURL(file);
  });
}

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
  canAdd,
  canDelete,
  filtered,
  filters,
}: {
  documents: Doc[];
  employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[];
  summary: { total: number; expired: number; expiring: number };
  canAdd: boolean;
  canDelete: boolean;
  filtered: boolean;
  filters: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Doc | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [formError, setFormError] = useState("");

  const [form, setForm] = useState(emptyForm);

  function openForm(document?: Doc) {
    setFormError("");
    setEditing(document ?? null);
    setForm(document ? {
      employeeId: document.employee.id,
      name: document.name,
      docType: document.docType,
      number: document.number ?? "",
      issuedDate: document.issuedDate ? todayKey(new Date(document.issuedDate)) : "",
      expiryDate: document.expiryDate ? todayKey(new Date(document.expiryDate)) : "",
      notes: document.notes ?? "",
    } : emptyForm);
    setViewing(null);
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    const attachment = new FormData(e.currentTarget).get("attachment");
    setBusy(true);
    try {
      let fileUrl: string | null = null;
      if (attachment instanceof File && attachment.size > 0) {
        if (attachment.size > DOCUMENT_ATTACHMENT_MAX_BYTES || !Object.keys(DOCUMENT_ATTACHMENT_TYPES).includes(attachment.type)) {
          throw new Error("Choose a PDF, PNG, JPEG, WebP or GIF file up to 2 MB.");
        }
        fileUrl = await readAttachment(attachment);
      }
      const res = await fetch(editing ? `/api/documents/${editing.id}` : "/api/documents", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: editing?.updatedAt, ...(fileUrl ? { fileUrl } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      toast("success", editing ? "Document saved." : "Document added.");
      setFormOpen(false);
      setForm(emptyForm);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save document.");
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
      const res = await fetch(`/api/documents/${confirmTarget}`, { method: "DELETE" });
      if (res.ok) {
        toast("success", "Deleted.");
        router.refresh();
      } else {
        toast("error", "Failed to delete");
      }
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not delete document.");
    } finally {
      setConfirmBusy(false);
      setConfirmTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Employee documents" description="Manage employee records and track expiry dates." actions={canAdd && <Button size="sm" disabled={!employees.length} onClick={() => openForm()}>
          <Plus className="h-3.5 w-3.5" /> Add document
        </Button>} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total documents" value={summary.total} icon={<FileText className="h-4 w-4" />} />
        <StatCard label="Expired" value={summary.expired} icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
        <StatCard label="Expiring within 60 days" value={summary.expiring} icon={<CalendarX2 className="h-4 w-4" />} tone="amber" />
      </div>
      {filters}
      {documents.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title={filtered ? "No matching documents" : "No documents yet"} description={filtered ? "Change or clear the search and expiry filters." : canAdd ? "Add an employee document with an optional file and expiry date." : "Documents for your assigned location will appear here."} action={!filtered && canAdd && employees.length > 0 ? <Button onClick={() => openForm()}>Add the first document</Button> : undefined} />
      ) : (
        <div className="divide-y divide-[color:var(--border)] rounded-2xl border border-edge bg-card">
          {documents.map((d) => (
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
              <div className="flex flex-wrap items-center gap-3">
                {d.expiryDate && (
                  <span className={`font-mono text-[12.5px] ${d.status === "expired" ? "text-rose-300" : d.status === "expiring" ? "text-amber-300" : "text-muted-foreground"}`}>
                    {formatDate(new Date(d.expiryDate))}
                  </span>
                )}
                <Badge tone={tone[d.status]} className="capitalize">{d.status === "none" ? "No expiration" : d.status === "ok" ? "Current" : d.status}</Badge>
                <Button size="icon" variant="ghost" aria-label={`View ${d.name}`} onClick={() => setViewing(d)}><Eye className="h-4 w-4" /></Button>
                {canDelete && <Button size="icon" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => del(d.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => !busy && setFormOpen(false)} title={editing ? "Edit document" : "Add document"} size="md">
        <form onSubmit={submit} className="space-y-4">
          {editing ? <p className="text-sm text-muted-foreground">{editing.employee.firstName} {editing.employee.lastName} · {editing.docType}</p> : <div className="grid gap-3 sm:grid-cols-2">
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
                {["other", "passport", "visa", "aadhaar", "pan", "license"].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Document name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Passport" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Issue date</span>
              <input type="date" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Document number</span>
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Masked in views" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Expiry date</span>
              <input type="date" min={form.issuedDate || undefined} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Notes</span>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{editing?.hasAttachment ? "Replace attachment" : "Attachment"}</span>
            <input name="attachment" type="file" accept={Object.keys(DOCUMENT_ATTACHMENT_TYPES).join(",")} className="block w-full text-sm" />
            <span className="mt-1 block text-xs text-muted-foreground">PDF or image, up to 2 MB.</span>
          </label>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? "Save document" : "Add document"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name} size="sm">
        {viewing && (
          <div className="space-y-3 text-[13px]">
            <p className="text-muted-foreground">{viewing.employee.firstName} {viewing.employee.lastName} · {viewing.docType}</p>
            {viewing.number && <p className="font-mono">••••{viewing.number.slice(-4)}</p>}
            {viewing.issuedDate && <p>Issued {formatDate(new Date(viewing.issuedDate))}</p>}
            {viewing.expiryDate && <p>Expires {formatDate(new Date(viewing.expiryDate))}</p>}
            {viewing.notes && <p className="text-muted-foreground">{viewing.notes}</p>}
            {viewing.hasAttachment && <a href={`/api/documents/${viewing.id}/attachment`} target="_blank" rel="noreferrer" className="inline-block font-medium text-primary hover:underline">Open attachment</a>}
            {canDelete && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => openForm(viewing)}><Pencil className="h-4 w-4" /> Edit document</Button></div>}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Delete document?"
        description="Delete this document record? This action cannot be undone."
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
