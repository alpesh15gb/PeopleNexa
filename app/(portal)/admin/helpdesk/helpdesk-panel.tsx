"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { HelpdeskPagination, type HelpdeskPage } from "@/components/helpdesk-pagination";

type Msg = { id: string; sender: { id: string; firstName: string; lastName: string; role: string }; body: string; createdAt: string };
type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  requester: { id: string; firstName: string; lastName: string; employeeNumber: string };
  assignee: { id: string; firstName: string; lastName: string } | null;
  messages: Msg[];
};

const prioTone: Record<string, "neutral" | "info" | "warning" | "danger"> = { low: "neutral", medium: "info", high: "warning", urgent: "danger" };
const statusTone: Record<string, "warning" | "info" | "success" | "neutral"> = { open: "warning", in_progress: "info", resolved: "success", closed: "neutral" };

export function HelpdeskPanel() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [summary, setSummary] = useState({ open: 0, resolved: 0, urgent: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<HelpdeskPage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ filter, page: String(page), pageSize: "25" });
    const res = await fetch(`/api/helpdesk?${params}`, { signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load tickets.");
    setTickets(data.tickets);
    setEmployees(data.employees);
    setSummary(data.summary);
    setPagination(data.pagination);
    setLoadError("");
  }, [filter, page]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load tickets.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, retry]);

  async function act(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/helpdesk/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed");
  }

  async function sendReply(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!reply.trim() || busy) return;
    setBusy(true);
    try {
      await act(id, { action: "message", body: reply });
      setReply("");
      toast("success", "Reply sent.");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: string) {
    if (updating) return;
    setUpdating(id);
    try {
      await act(id, { action: "update", status });
      toast("success", `Ticket ${status.replace("_", " ")}.`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update the ticket.");
    } finally {
      setUpdating(null);
    }
  }

  async function assign(id: string, assigneeId: string) {
    if (updating) return;
    setUpdating(id);
    try {
      await act(id, { action: "update", assigneeId });
      toast("success", "Assignee updated.");
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not update the assignee.");
    } finally {
      setUpdating(null);
    }
  }

  function del(id: string) {
    setConfirmTarget(id);
  }

  async function doConfirm() {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/helpdesk/${confirmTarget}`, { method: "DELETE" });
      if (res.ok) {
        toast("success", "Ticket deleted.");
        await load();
        setConfirmTarget(null);
      } else {
        const result = await res.json().catch(() => null);
        toast("error", result?.error ?? "Could not delete the ticket.");
      }
    } catch {
      toast("error", "Could not confirm deletion. Refresh to check the ticket.");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="mr-3 text-amber-300">{summary.open} open</span>
          <span className="mr-3 text-emerald-300">{summary.resolved} resolved</span>
          {summary.urgent > 0 && <span className="text-rose-300">{summary.urgent} urgent</span>}
        </p>
        <div className="flex gap-2">
          {["all", "open", "resolved"].map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(1); setOpenId(null); setReply(""); }} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium capitalize ${filter === f ? "bg-gradient-brand text-white" : "bg-tint text-muted-foreground hover:text-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 p-3 text-sm"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading tickets…</p> : tickets.length === 0 && !loadError ? (
        <EmptyState icon={<LifeBuoy className="h-5 w-5" />} title={filter === "all" ? "No tickets" : `No ${filter} tickets`} description={filter === "all" ? "Employee-raised support tickets will appear here." : undefined} />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-edge bg-card">
              <button aria-expanded={openId === t.id} onClick={() => { setOpenId(openId === t.id ? null : t.id); setReply(""); }} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-tint/40">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                  {t.requester.firstName[0]}{t.requester.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{t.subject}</p>
                  <p className="text-[11.5px] text-muted-foreground">{t.requester.firstName} {t.requester.lastName} · {t.category}{t.assignee ? ` · → ${t.assignee.firstName}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={prioTone[t.priority] ?? "neutral"} className="capitalize">{t.priority}</Badge>
                  <Badge tone={statusTone[t.status] ?? "neutral"} className="capitalize">{t.status.replace("_", " ")}</Badge>
                  <span className="text-[11.5px] text-muted-foreground">{t.messages.length} msg</span>
                </div>
              </button>

              {openId === t.id && (
                <div className="border-t border-edge px-5 py-4">
                  <p className="mb-3 text-[13px] text-muted-foreground">{t.description}</p>
                  <div className="space-y-2">
                    {t.messages.map((m) => (
                      <div key={m.id} className={`rounded-xl px-3.5 py-2.5 text-[12.5px] ${m.sender.role === "admin" ? "ml-auto max-w-[85%] bg-indigo-500/15" : "max-w-[85%] bg-tint"}`}>
                        <p className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">{m.sender.firstName} {m.sender.lastName} · {formatDateTime(new Date(m.createdAt))}</p>
                        {m.body}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select disabled={updating !== null} aria-label="Ticket assignee" value={t.assignee?.id ?? ""} onChange={(e) => assign(t.id, e.target.value)} className="rounded-lg border border-edge bg-card px-2.5 py-2 text-[12.5px] outline-none">
                      <option value="">Unassigned</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                    <Button size="sm" variant="outline" onClick={() => changeStatus(t.id, "in_progress")} disabled={updating !== null || t.status === "in_progress"}>{t.status === "closed" || t.status === "resolved" ? "Reopen" : "Start work"}</Button>
                    <Button size="sm" variant={t.status === "resolved" ? "success" : "outline"} onClick={() => changeStatus(t.id, "resolved")} disabled={updating !== null || t.status === "resolved" || t.status === "closed"}>Resolve</Button>
                    <Button size="sm" variant="ghost" onClick={() => changeStatus(t.id, "closed")} disabled={updating !== null || t.status === "closed"}>Close</Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ticket ${t.subject}`} disabled={updating !== null} onClick={() => del(t.id)}><Trash2 className="h-4 w-4 text-rose-400" /></Button>
                  </div>
                  {t.status !== "closed" && <form onSubmit={(e) => sendReply(e, t.id)} className="mt-3 flex items-center gap-2">
                    <input aria-label="Reply" maxLength={10000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to employee…" className="min-w-0 flex-1 rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
                    <Button type="submit" size="sm" disabled={!reply.trim()} loading={busy}><Send className="h-3.5 w-3.5" /> Send</Button>
                  </form>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <HelpdeskPagination pagination={pagination} onPage={(next) => { setPage(next); setOpenId(null); setReply(""); }} />

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Delete ticket?"
        description="Delete this ticket? This action cannot be undone."
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
