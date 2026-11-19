"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PayrollError({ reset }: { error: Error; reset: () => void }) {
  return <main className="payroll-canvas p-6"><section role="alert" className="mx-auto max-w-5xl rounded-xl border border-destructive/30 bg-card p-5"><h1 className="font-semibold">Payroll could not load</h1><p className="mt-1 text-sm text-muted-foreground">Retry this page or return to the monthly payroll workspace.</p><div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={reset}>Retry</Button><Link href="/admin/payroll" className="text-sm font-medium text-primary hover:underline">Monthly payroll</Link></div></section></main>;
}
