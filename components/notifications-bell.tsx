"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Inbox, X } from "lucide-react";
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
  info: <Info className="h-3.5 w-3.5 text-primary" />,
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
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 76, width: 320, maxHeight: 400 });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const width = Math.min(window.innerWidth >= 640 ? 384 : 320, viewportWidth - 32);
      const left = Math.max(viewportLeft + 16, Math.min(rect.right - width, viewportLeft + viewportWidth - width - 16));
      const top = Math.max(viewportTop + 16, Math.min(rect.bottom + 8, viewportTop + viewportHeight - 160));
      setPosition({ left, top, width, maxHeight: Math.max(0, viewportTop + viewportHeight - top - 16) });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
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
        ref={trigger}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-edge bg-tint text-muted-foreground transition-colors duration-200 hover:border-primary/25 hover:bg-primary/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(37,99,235,0.8)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Notifications" style={position} className="card-surface fixed z-[60] flex flex-col overflow-hidden rounded-xl bg-card-2 shadow-2xl">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
              <p className="font-display text-sm font-semibold">Notifications</p>
              <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="flex cursor-pointer items-center gap-1 rounded-md text-[11.5px] font-medium text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button aria-label="Close notifications" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
              </div>
            </div>
            <div className="min-h-0 max-h-80 overflow-y-auto overscroll-contain">
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
                      "flex gap-3 border-b border-edge px-4 py-3 transition-colors duration-200 hover:bg-primary/[0.04]",
                      !n.isRead && "bg-primary/[0.06]"
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{icons[n.type as keyof typeof icons] ?? icons.info}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold">{n.title}</p>
                        {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
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
              className="block shrink-0 border-t border-edge px-4 py-2.5 text-center text-[12.5px] font-medium text-primary transition-colors duration-200 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              View all notifications
            </Link>
          </div>
        </>, document.body
      )}
    </div>
  );
}
