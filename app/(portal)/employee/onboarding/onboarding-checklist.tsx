"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, PartyPopper, Rocket } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import { formatCalendarDate } from "@/lib/workspace-time";

interface Task {
  id: string;
  name: string;
  status: string;
  dueBy: Date | null;
  completedAt: Date | null;
}

export function OnboardingChecklist({ tasks, locale, today }: { tasks: Task[]; locale: string; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const allDone = tasks.length > 0 && done === tasks.length;
  const orderedTasks = [...tasks].sort((left, right) => Number(left.status === "done") - Number(right.status === "done"));

  async function toggle(task: Task) {
    if (busy) return;
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
    } catch {
      toast("error", "Could not update the task. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-5">
      {tasks.length > 0 && <div className="mb-5 rounded-2xl border border-edge bg-card-2 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-display text-[15px] font-bold">
              {allDone ? "Checklist complete" : `${done} of ${tasks.length} tasks completed`}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {allDone
                ? "HR can see your completed checklist."
                : "Select a task to update its status."}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">{pct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-tint-strong" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-edge-strong bg-tint text-muted-foreground">
            <PartyPopper className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold">No tasks assigned yet</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            Your checklist will appear here once HR assigns it.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {orderedTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              disabled={busy !== null}
              aria-pressed={t.status === "done"}
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
              <span className={`min-w-0 flex-1 break-words text-[13.5px] font-medium ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                {t.name}
              </span>
              {t.status === "done" && t.completedAt ? <span className="text-xs text-muted-foreground">Completed {formatCalendarDate(istDateKey(t.completedAt), locale)}</span> : t.dueBy &&
                <span className={`text-xs ${istDateKey(t.dueBy) < today ? "text-destructive" : "text-muted-foreground"}`}>{istDateKey(t.dueBy) < today ? "Overdue since" : "Due"} {formatCalendarDate(istDateKey(t.dueBy), locale)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
