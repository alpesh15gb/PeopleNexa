"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";

export function DatePicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="date"
        defaultValue={value}
        onChange={(e) => {
          if (e.target.value) router.push(`/admin/attendance?date=${e.target.value}`);
        }}
        className="h-10 w-full appearance-none rounded-xl border border-input bg-tint pl-9 pr-3 text-sm text-foreground transition-all focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-44"
      />
    </div>
  );
}
