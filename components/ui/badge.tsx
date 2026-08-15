import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

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

const statusLabels: Record<string, { en: string; hi: string }> = {
  present: { en: "Present", hi: "उपस्थित" },
  late: { en: "Late", hi: "विलंब" },
  permission: { en: "Permission", hi: "अनुमति" },
  absent: { en: "Absent", hi: "अनुपस्थित" },
  half_day: { en: "Half day", hi: "आधा दिन" },
  pending: { en: "Pending", hi: "लंबित" },
  approved: { en: "Approved", hi: "स्वीकृत" },
  rejected: { en: "Rejected", hi: "अस्वीकृत" },
  active: { en: "Active", hi: "सक्रिय" },
  inactive: { en: "Inactive", hi: "निष्क्रिय" },
  paid: { en: "Paid", hi: "भुगतान" },
  draft: { en: "Draft", hi: "ड्राफ्ट" },
  available: { en: "Available", hi: "उपलब्ध" },
  assigned: { en: "Assigned", hi: "आवंटित" },
  maintenance: { en: "Maintenance", hi: "रखरखाव" },
  retired: { en: "Retired", hi: "सेवानिवृत्त" },
  lost: { en: "Lost", hi: "खोया" },
};

export function StatusPill({ status, lang = "en" }: { status: string; lang?: "en" | "hi" }) {
  const label = statusLabels[status]?.[lang] ?? status.replace(/_/g, " ");
  return (
    <Badge tone={statusTones[status] ?? "neutral"} className="capitalize">
      {label}
    </Badge>
  );
}
