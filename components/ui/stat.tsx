import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

const chipStyles: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-300 border-indigo-400/20",
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
  amber: "bg-amber-500/10 text-amber-300 border-amber-400/20",
  rose: "bg-rose-500/10 text-rose-300 border-rose-400/20",
  sky: "bg-sky-500/10 text-sky-300 border-sky-400/20",
  violet: "bg-violet-500/10 text-violet-300 border-violet-400/20",
};

export function StatCard({
  label,
  value,
  icon,
  tone = "indigo",
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof chipStyles;
  sub?: ReactNode;
  className?: string;
}) {
  return (
      <Card className={cn("p-4.5 transition-shadow duration-200 hover:shadow-[0_14px_32px_-24px_rgba(16,24,40,0.45)] sm:p-5", className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[0.01em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-[30px] font-bold leading-none tracking-[-0.03em]">{value}</p>
          {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", chipStyles[tone])}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-card text-muted-foreground shadow-[0_6px_18px_-16px_rgba(16,24,40,0.4)]">
          {icon}
        </div>
      )}
      <div>
        <p className="font-display text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
