import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-tint-strong text-muted-foreground border-edge-strong",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
  warning: "bg-amber-500/10 text-amber-300 border-amber-400/20",
  danger: "bg-rose-500/10 text-rose-300 border-rose-400/20",
  info: "bg-sky-500/10 text-sky-300 border-sky-400/20",
  violet: "bg-violet-500/10 text-violet-300 border-violet-400/20",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", className)} />;
}

const statusTones: Record<string, Tone> = {
  present: "success",
  late: "warning",
  permission: "info",
  absent: "danger",
  half_day: "violet",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  active: "success",
  inactive: "neutral",
  paid: "success",
  draft: "neutral",
  available: "success",
  assigned: "info",
  maintenance: "warning",
  retired: "neutral",
  lost: "danger",
};

export function StatusPill({ status, lang = "en" }: { status: string; lang?: Lang }) {
  const label = t(lang, `status.${status}`) === `status.${status}` ? status.replace(/_/g, " ") : t(lang, `status.${status}`);
  return (
    <Badge tone={statusTones[status] ?? "neutral"} className="capitalize">
      {label}
    </Badge>
  );
}
