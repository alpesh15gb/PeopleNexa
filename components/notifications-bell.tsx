"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const icons = {
  info: <Info className="h-3.5 w-3.5 text-sky-400" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
  danger: <XCircle className="h-3.5 w-3.5 text-rose-400" />,
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=8");
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative rounded-xl border border-edge bg-tint p-2 text-muted-foreground transition-colors hover:bg-tint-strong hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-brand px-1 text-[10px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(99,102,241,0.8)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card-surface absolute right-0 z-40 mt-2 w-80 animate-scale-in overflow-hidden rounded-xl bg-card-2 shadow-2xl sm:w-96">
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <p className="font-display text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-[11.5px] font-medium text-indigo-300 transition-colors hover:text-indigo-200">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted-foreground">
                  <span className="h-3 w-3 animate-spin rounded-full border border-muted-foreground/40 border-t-transparent" />
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Inbox className="h-6 w-6 opacity-60" />
                  <p className="text-[12.5px]">You're all caught up</p>
                </div>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 border-b border-edge px-4 py-3 transition-colors hover:bg-tint",
                      !n.isRead && "bg-indigo-500/[0.05]"
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{icons[n.type as keyof typeof icons] ?? icons.info}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold">{n.title}</p>
                        {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-[10.5px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-edge px-4 py-2.5 text-center text-[12.5px] font-medium text-indigo-300 transition-colors hover:bg-tint"
            >
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
