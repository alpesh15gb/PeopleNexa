"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";

export function DatePicker({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="date"
        aria-label="Attendance date"
        defaultValue={value}
        key={value}
        onChange={(e) => {
          if (!e.target.value) return;
          const next = new URLSearchParams(params.toString());
          next.set("date", e.target.value);
          router.push(`/admin/attendance?${next.toString()}`);
        }}
        className="h-10 w-full appearance-none rounded-xl border border-input bg-tint pl-9 pr-3 text-sm text-foreground transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-44"
      />
    </div>
  );
}
