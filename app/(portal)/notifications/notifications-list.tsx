"use client";

import { useRouter } from "next/navigation";
import { CheckCheck, Info, CheckCircle2, AlertTriangle, XCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/stat";

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

function formatWhen(dateStr: string | Date) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationsList({ notifications, lang = "en" }: { notifications: Notif[]; lang?: Lang }) {
  const router = useRouter();

  async function markRead(id: string) {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title={t(lang, "notifications.none")}
        description={t(lang, "notifications.noneDesc")}
      />
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
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
                  {t(lang, "notifications.new")}
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{n.message}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">{formatWhen(n.createdAt)}</p>
          </div>
          {!n.isRead && (
            <button
              onClick={() => markRead(n.id)}
              title={t(lang, "notifications.markRead")}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
