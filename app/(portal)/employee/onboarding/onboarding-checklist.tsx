"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, PartyPopper, Rocket } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

interface Task {
  id: string;
  name: string;
  status: string;
  dueBy: Date | null;
  completedAt: Date | null;
}

export function OnboardingChecklist({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const allDone = tasks.length > 0 && done === tasks.length;

  async function toggle(task: Task) {
    setBusy(task.id);
    try {
      const res = await fetch(`/api/onboarding/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-5">
      <div className="mb-5 rounded-2xl border border-edge bg-card-2 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-display text-[15px] font-bold">
              {allDone ? "All done — welcome to the team! 🎉" : `${done} of ${tasks.length} tasks completed`}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {allDone
                ? "HR will see your completed checklist. Check your documents and payslips whenever you like."
                : "Tick tasks off as you finish them — HR tracks your progress."}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">{pct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-tint-strong">
          <div className="h-full rounded-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-tint text-muted-foreground">
            <PartyPopper className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold">No tasks assigned yet</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            Your HR team hasn't added your onboarding checklist yet — check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              disabled={busy === t.id}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                t.status === "done"
                  ? "border-emerald-400/20 bg-emerald-500/[0.05]"
                  : "border-edge bg-card-2 hover:border-edge-strong"
              }`}
            >
              {t.status === "done" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <span className={`flex-1 text-[13.5px] font-medium ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                {t.name}
              </span>
              {t.dueBy && (
                <span className="text-[11px] text-muted-foreground">Due {formatDate(t.dueBy)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
