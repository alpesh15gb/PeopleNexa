"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Clock3, FileQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/stat";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { toDateKey, formatTime } from "@/lib/dates";

type Correction = {
  id: string;
  date: string;
  currentIn: string | null;
  currentOut: string | null;
  requestedIn: string | null;
  requestedOut: string | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
};

const fmt = (iso: string | null) => (iso ? formatTime(new Date(iso)) : "—");

export function RegularizationPanel({ corrections }: { corrections: Correction[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(id);
    try {
      const res = await fetch(`/api/attendance/corrections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: reviewNote[id] || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to review");
      toast("success", status === "approved" ? "Correction approved — attendance updated." : "Correction rejected.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to review");
    } finally {
      setBusy(null);
    }
  }

  if (corrections.length === 0) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="No corrections yet"
        description="Employee-requested punch corrections will appear here for approval."
      />
    );
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {corrections.map((c) => {
        const pending = c.status === "pending";
        return (
          <div key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
              {(c.employee.firstName[0] ?? "") + (c.employee.lastName[0] ?? "")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13.5px] font-medium">
                  {c.employee.firstName} {c.employee.lastName}
                  <span className="ml-1.5 text-[11.5px] text-muted-foreground">({c.employee.employeeNumber})</span>
                </p>
                <span className="font-mono text-[12px] text-muted-foreground">{toDateKey(new Date(c.date))}</span>
                <Badge tone={pending ? "warning" : c.status === "approved" ? "success" : "danger"}>{c.status}</Badge>
              </div>

              <div className="mt-2 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Current: {fmt(c.currentIn)} → {fmt(c.currentOut)}
                </div>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Requested: {fmt(c.requestedIn)} → {fmt(c.requestedOut)}
                </div>
              </div>

              <p className="mt-2 rounded-lg bg-tint px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                “{c.reason}”
              </p>
              {c.reviewNote && (
                <p className="mt-1.5 text-[12px] text-muted-foreground/70">Note: {c.reviewNote}</p>
              )}

              {pending && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Note (optional)"
                    value={reviewNote[c.id] ?? ""}
                    onChange={(e) => setReviewNote((v) => ({ ...v, [c.id]: e.target.value }))}
                    className="h-9 w-56"
                  />
                  <Button size="sm" variant="success" loading={busy === c.id} onClick={() => review(c.id, "approved")}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="danger" loading={busy === c.id} onClick={() => review(c.id, "rejected")}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
