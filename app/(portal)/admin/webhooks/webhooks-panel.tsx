"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Radio, Copy, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface Endpoint {
  id: string;
  name: string;
  url: string;
  events: string;
  secret: string;
  active: boolean;
  createdAt: Date;
}

const EVENT_LABELS: Record<string, string> = {
  "punch.created": "Punch created",
  "attendance.finalized": "Day finalized",
  "leave.approved": "Leave approved",
  "expense.created": "Expense claimed",
  "employee.created": "Employee added",
  "ticket.created": "Support ticket",
};

export function WebhooksPanel({ endpoints }: { endpoints: Endpoint[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const events = Array.from(form.getAll("event")) as string[];
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), url: form.get("url"), events }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to create");
        return;
      }
      toast("success", "Webhook created — secret generated");
      setOpen(false);
      router.refresh();
    } catch {
      toast("error", "Failed to create");
    }
  }

  async function toggle(ep: Endpoint) {
    setBusy(ep.id);
    try {
      const res = await fetch("/api/webhooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ep.id, active: !ep.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function test(ep: Endpoint) {
    setBusy(ep.id);
    try {
      const res = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ep.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Test failed");
        return;
      }
      toast("success", "Test event sent — check your receiver");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast("error", data.error ?? "Failed to delete");
      return;
    }
    toast("success", "Webhook removed");
    router.refresh();
  }

  function copySecret(ep: Endpoint) {
    navigator.clipboard.writeText(ep.secret).then(() => {
      setCopied(ep.id);
      toast("success", "Secret copied");
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">
          {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"} · payloads signed with HMAC-SHA256
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-tint text-muted-foreground">
            <Radio className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold">No webhooks yet</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            Create an endpoint to push punch, leave, expense and employee events to your own systems in real time.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className={`h-2 w-2 shrink-0 rounded-full ${ep.active ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                  {ep.name}
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ep.active ? "bg-emerald-500/10 text-emerald-300" : "bg-tint-strong text-muted-foreground"}`}>
                    {ep.active ? "Active" : "Paused"}
                  </span>
                </p>
                <p className="truncate font-mono text-[11.5px] text-muted-foreground">{ep.url}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ep.events.split(",").map((ev) => (
                    <span key={ev} className="rounded-md bg-tint px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                      {EVENT_LABELS[ev] ?? ev}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => copySecret(ep)}
                className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground hover:bg-tint"
                title="Copy signing secret"
              >
                {copied === ep.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {ep.secret.slice(0, 10)}…
              </button>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" loading={busy === ep.id} onClick={() => test(ep)}>
                  <Zap className="h-3.5 w-3.5" /> Test
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === ep.id} onClick={() => toggle(ep)}>
                  {ep.active ? "Pause" : "Resume"}
                </Button>
                <Button size="icon" variant="ghost" className="text-rose-300" onClick={() => remove(ep.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New webhook endpoint" size="md">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name">
            <Input name="name" required placeholder="e.g. ERP sync, WhatsApp gateway" />
          </Field>
          <Field label="Endpoint URL" hint="We POST signed JSON to this URL (max 8s timeout)">
            <Input name="url" required type="url" placeholder="https://your-server.com/hooks/peoplenexa" />
          </Field>
          <Field label="Events">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(EVENT_LABELS).map(([ev, label]) => (
                <label key={ev} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-edge px-3 py-2.5 text-[13px] hover:bg-tint">
                  <input type="checkbox" name="event" value={ev} defaultChecked className="h-4 w-4 accent-indigo-500" />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create endpoint</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
