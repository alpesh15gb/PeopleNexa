"use client";

import { Button } from "@/components/ui/button";

export default function AttendanceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 py-8 text-center">
      <p className="font-display text-sm font-semibold">Attendance could not be loaded</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Please try again. If this continues, contact your administrator.</p>
      <Button className="mt-4" size="sm" onClick={reset}>Try again</Button>
    </div>
  );
}
