"use client";

import { useRouter } from "next/navigation";
import { CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/stat";
import { type WorkspaceRegion } from "@/lib/workspace-region";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date | string;
}

const icons = {
  info: <Info className="h-4 w-4 text-sky-400" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  danger: <XCircle className="h-4 w-4 text-rose-400" />,
};

export function NotificationsList({ notifications, unread, unreadOnly, region, lang = "en" }: { notifications: Notif[]; unread: number; unreadOnly: boolean; region: WorkspaceRegion; lang?: Lang }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const formatter = new Intl.DateTimeFormat(region.locale, { timeZone: region.timeZone, dateStyle: "medium", timeStyle: "short" });
  async function markRead(id?: string) {
    if (pending) return;
    setPending(id ?? "all");
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }),
      });
      if (!response.ok) throw new Error("Could not mark the notification as read.");
      router.refresh();
    } catch {
      toast("error", "Could not mark the notification as read.");
    } finally {
      setPending(null);
    }
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title={unreadOnly ? "No unread notifications" : t(lang, "notifications.none")}
        description={unreadOnly ? "Open All activity to see previous updates." : t(lang, "notifications.noneDesc")}
      />
    );
  }

  return (
    <div className="divide-y divide-[color:var(--border)]">
      {unread > 0 && <div className="flex justify-end px-4 py-2"><Button size="sm" variant="ghost" loading={pending === "all"} disabled={pending !== null} onClick={() => markRead()}>Mark all as read</Button></div>}
      {notifications.map((n) => (
        <div
          key={n.id}
          className={cn(
            "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-tint",
            !n.isRead && "bg-indigo-500/[0.05]"
          )}
        >
          <span className="mt-0.5 shrink-0">{icons[n.type as keyof typeof icons] ?? icons.info}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13.5px] font-semibold">{n.title}</p>
              {!n.isRead && (
                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  Unread
                </span>
              )}
            </div>
            <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">{n.message}</p>
            <time dateTime={new Date(n.createdAt).toISOString()} className="mt-1.5 block text-[11px] text-muted-foreground">{formatter.format(new Date(n.createdAt))}</time>
          </div>
          {!n.isRead && (
            <button
              onClick={() => markRead(n.id)}
              disabled={pending !== null}
              title={t(lang, "notifications.markRead")}
              aria-label={`${t(lang, "notifications.markRead")}: ${n.title}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
            >
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
