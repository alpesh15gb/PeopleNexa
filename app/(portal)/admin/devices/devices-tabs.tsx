"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DevicesTabs({
  counts,
  ebioCount,
  rtCount,
  essl,
  ebio,
  realtime,
}: {
  counts: { total: number; online: number; offline: number };
  ebioCount: number;
  rtCount: number;
  essl: ReactNode;
  ebio: ReactNode;
  realtime: ReactNode;
}) {
  const [tab, setTab] = useState<"essl" | "ebio" | "realtime">("essl");
  const btn = (key: typeof tab, label: string, n: number) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={cn(
        "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors",
        tab === key ? "bg-gradient-brand text-white" : "text-muted-foreground hover:bg-tint hover:text-foreground"
      )}
    >
      {label} <span className="ml-1 opacity-70">{n}</span>
    </button>
  );

  void counts;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {btn("essl", "ESSL devices", counts.total)}
        {btn("ebio", "eBioserver devices", ebioCount)}
        {btn("realtime", "Realtime devices", rtCount)}
      </div>

      {tab === "essl" && essl}
      {tab === "ebio" && ebio}
      {tab === "realtime" && realtime}
    </div>
  );
}
