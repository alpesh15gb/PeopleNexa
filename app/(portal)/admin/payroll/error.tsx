"use client";

import { Button } from "@/components/ui/button";

export default function PayrollError({ reset }: { error: Error; reset: () => void }) {
  return <main className="payroll-canvas p-6"><section className="mx-auto max-w-5xl rounded-xl border border-destructive/30 bg-card p-5"><h1 className="font-semibold">Monthly payroll could not load</h1><p className="mt-1 text-sm text-muted-foreground">Check the selected location and month, then retry.</p><Button className="mt-4" onClick={reset}>Retry</Button></section></main>;
}
