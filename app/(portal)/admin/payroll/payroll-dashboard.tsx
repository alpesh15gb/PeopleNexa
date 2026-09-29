"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Kept for existing links while the operational page is served by PayrollPanel. */
export function PayrollDashboard() {
  const router = useRouter();
  return <main className="payroll-canvas animate-fade-up">
    <section className="rounded-2xl border border-edge bg-card p-6">
      <h1 className="font-display text-2xl font-semibold">Monthly payroll</h1>
      <p className="mt-2 text-sm text-muted-foreground">Open the monthly payroll workflow to choose a location and month.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => router.push("/admin/payroll")}><ArrowRight aria-hidden="true" className="h-4 w-4" />Open monthly payroll</Button>
        <Button variant="outline" onClick={() => router.push("/admin/payroll/configuration")}><Settings2 aria-hidden="true" className="h-4 w-4" />Payroll policy</Button>
      </div>
    </section>
  </main>;
}
