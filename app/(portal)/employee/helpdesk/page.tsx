"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";

type Msg = { id: string; sender: { id: string; firstName: string; lastName: string; role: string }; body: string; createdAt: string };
type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  messages: Msg[];
};

const tone: Record<string, "warning" | "info" | "success"> = { open: "warning", in_progress: "info", resolved: "success", closed: "neutral" as never };

export default function EmployeeHelpdeskPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  async function load() {
    const res = await fetch("/api/helpdesk");
    const data = await res.json();
    setTickets(data.tickets);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/helpdesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast("success", "Ticket raised — the team has been notified.");
      setCreating(false);
      setForm({ subject: "", description: "", category: "general", priority: "medium" });
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!reply.trim()) return;
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
      await load();
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
          <p className="mt-1 text-sm text-muted-foreground">Raise a ticket — payroll, attendance, device or IT issues.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New ticket</Button>
      </div>

      {creating && (
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-edge bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Subject</span>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required placeholder="Brief summary of the issue" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Describe the issue</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={3} placeholder="What happened? When? What did you expect?" className="w-full rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Raise ticket</Button>
          </div>
        </form>
      )}

      {tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-5 w-5" />} title="No tickets" description="Raise your first support ticket above." />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl border border-edge bg-card">
              <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-tint/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{t.subject}</p>
                  <p className="text-[11.5px] text-muted-foreground">{t.category} · {new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge tone={tone[t.status] ?? "neutral"} className="capitalize">{t.status.replace("_", " ")}</Badge>
              </button>
              {openId === t.id && (
                <div className="border-t border-edge px-5 py-4">
                  <p className="mb-3 text-[13px] text-muted-foreground">{t.description}</p>
                  <div className="space-y-2">
                    {t.messages.map((m) => (
                      <div key={m.id} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12.5px] ${m.sender.id === "you" || m.sender.role !== "admin" ? "" : "ml-auto bg-indigo-500/15"}`}>
                        <p className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">{m.sender.firstName} {m.sender.lastName} {m.sender.role === "admin" ? "(support)" : ""} · {new Date(m.createdAt).toLocaleString()}</p>
                        {m.body}
                      </div>
                    ))}
                  </div>
                  {t.status !== "closed" && (
                    <form onSubmit={(e) => sendReply(e, t.id)} className="mt-3 flex items-center gap-2">
                      <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="flex-1 rounded-xl border border-edge bg-card px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400/50" />
                      <Button type="submit" size="sm" loading={busy}><Send className="h-3.5 w-3.5" /></Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
