"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/dates";
import { HelpdeskPagination, type HelpdeskPage } from "@/components/helpdesk-pagination";
import { useRouteAction } from "@/components/use-route-action";

type Msg = { id: string; sender: { id: string; firstName: string; lastName: string; role: string }; body: string; createdAt: string };
type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  isRequester: boolean;
  messages: Msg[];
};

const tone: Record<string, "warning" | "info" | "success"> = { open: "warning", in_progress: "info", resolved: "success", closed: "neutral" as never };

export default function EmployeeHelpdeskPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creating, setCreating] = useRouteAction("new");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<HelpdeskPage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [summary, setSummary] = useState<{ open: number; resolved: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ view: "personal", page: String(page), pageSize: "25", filter });
    const res = await fetch(`/api/helpdesk?${params}`, { signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load your tickets.");
    if (signal?.aborted) return;
    setTickets(data.tickets);
    setPagination(data.pagination);
    setLoadError("");
    setSummary(data.summary);
  }, [page, filter]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load your tickets.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load, retry]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    setBusy(true);
    try {
      const res = await fetch("/api/helpdesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Ticket raised.");
      setCreating(false);
      setForm({ subject: "", description: "", category: "general", priority: "medium" });
      setPage(1);
      setFilter("open");
      setOpenId(data.ticket.id);
      setRetry((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not raise the ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (busy || !reply.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/helpdesk/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", body: reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setReply("");
      toast("success", "Reply sent.");
      setRetry((value) => value + 1);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Helpdesk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ask for support, follow ticket status, and reply in the same conversation.</p>
        </div>
        <Button onClick={() => { setFormError(""); setCreating(true); }}><Plus aria-hidden="true" className="h-4 w-4" /> New ticket</Button>
      </div>

      {creating && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-edge bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Subject</span>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required maxLength={200} placeholder="Brief summary of the issue" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Describe the issue</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required maxLength={10000} rows={3} placeholder="What happened? When? What did you expect?" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                {["general", "payroll", "attendance", "device", "it", "other"].map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Priority</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50">
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Raise ticket</Button>
          </div>
        </form>
      )}

      <div role="group" aria-label="Filter tickets" className="flex flex-wrap gap-2">
        {[["all", "All tickets"], ["open", `Open${summary ? ` (${summary.open})` : ""}`], ["resolved", `Resolved${summary ? ` (${summary.resolved})` : ""}`]].map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setOpenId(null); setReply(""); }}>{label}</Button>
        ))}
      </div>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading tickets…</p> : loadError ? (
        <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{loadError}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Retry tickets</Button></div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-5 w-5" />} title={filter === "all" ? "No tickets yet" : `No ${filter} tickets`} description={filter === "all" ? "Raise your first support ticket when you need help." : "Select All tickets to see your other requests."} />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-edge bg-card">
              <button aria-expanded={openId === t.id} onClick={() => { setOpenId(openId === t.id ? null : t.id); setReply(""); }} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-tint/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{t.subject}</p>
                  <p className="text-[11.5px] text-muted-foreground">{!t.isRequester && "Assigned to you · "}{t.category} · {formatDate(new Date(t.createdAt))}</p>
                </div>
                <Badge tone={tone[t.status] ?? "neutral"} className="capitalize">{t.status.replace("_", " ")}</Badge>
              </button>
              {openId === t.id && (
                <div className="border-t border-edge px-5 py-4">
                  <p className="mb-3 text-[13px] text-muted-foreground">{t.description}</p>
                  <div className="space-y-2">
                    {t.messages.map((m) => (
                      <div key={m.id} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12.5px] ${m.sender.id === "you" || m.sender.role !== "admin" ? "" : "ml-auto bg-indigo-500/15"}`}>
                        <p className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">{m.sender.firstName} {m.sender.lastName} {m.sender.role === "admin" ? "(support)" : ""} · {formatDateTime(new Date(m.createdAt))}</p>
                        {m.body}
                      </div>
                    ))}
                  </div>
                  {t.status !== "closed" && (
                    <form onSubmit={(e) => sendReply(e, t.id)} className="mt-3 flex items-center gap-2">
                      <input aria-label="Reply" maxLength={10000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="min-w-0 flex-1 rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
                      <Button type="submit" size="sm" loading={busy} disabled={!reply.trim()} aria-label="Send reply"><Send aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !loadError && <HelpdeskPagination pagination={pagination} onPage={(next) => { setPage(next); setOpenId(null); setReply(""); }} />}
    </div>
  );
}
