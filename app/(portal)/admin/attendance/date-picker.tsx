"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";

export function DatePicker({ value, label = "Attendance date" }: { value: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="date"
        aria-label={label}
        defaultValue={value}
        key={value}
        onChange={(e) => {
          if (!e.target.value) return;
          const next = new URLSearchParams(params.toString());
          next.set("date", e.target.value);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="h-10 w-full appearance-none rounded-xl border border-input bg-tint pl-9 pr-3 text-sm text-foreground transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-44"
      />
    </div>
  );
}
