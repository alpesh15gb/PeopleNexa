"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { starterOnboardingTasks } from "@/lib/onboarding-tasks";
import { istDateKey } from "@/lib/ist";
import { formatCalendarDate } from "@/lib/workspace-time";

interface Task {
  id: string;
  name: string;
  status: string;
  dueBy: Date | null;
  completedAt: Date | null;
}

type Resources = { documents: boolean; policies: boolean; helpdesk: boolean };

function TaskGuidance({ name, resources }: { name: string; resources: Resources }) {
  const link = "inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-4";
  if (name === starterOnboardingTasks.contact) return (
    <p>Review your personal and emergency details in <Link className={link} href="/employee/profile">My profile</Link>. Ask HR to update anything that has changed.</p>
  );
  if (name === starterOnboardingTasks.documents) return (
    <div className="space-y-3">
      <dl className="space-y-2">
        <div><dt className="font-semibold text-foreground">HR gives instructions</dt><dd>Ask HR which documents they need, how to submit them securely, and who will review them.</dd></div>
        <div><dt className="font-semibold text-foreground">You send the documents</dt><dd>Use the submission channel HR gives you. After sending, mark this task complete.</dd></div>
        <div><dt className="font-semibold text-foreground">The designated reviewer checks them</dt><dd>Contact HR for the outcome or to ask whether they need any changes.</dd></div>
      </dl>
      {resources.helpdesk && <Link className={link} href="/employee/helpdesk?action=new">Ask HR for instructions <ArrowRight className="size-3.5" aria-hidden="true" /></Link>}
    </div>
  );
  if (name === starterOnboardingTasks.equipment) return <p>Use the setup instructions from your manager.{resources.documents && <> You can also review <Link className={link} href="/employee/documents?from=onboarding">documents and equipment shared with you</Link>.</>}</p>;
  if (name === starterOnboardingTasks.policies && resources.policies) return <p>Open <Link className={link} href="/employee/policies">Company policies</Link> and read the policies HR assigned.</p>;
  return null;
}

export function OnboardingChecklist({ tasks, locale, today, resources }: {
  tasks: Task[];
  locale: string;
  today: string;
  resources: Resources;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>();
  const [savingId, setSavingId] = useState<string>();
  const [refreshing, refresh] = useTransition();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const nextHeading = useRef<HTMLHeadingElement>(null);
  const moveFocusToTask = useRef(false);
  const remaining = tasks.filter((task) => task.status !== "done");
  const completed = tasks.filter((task) => task.status === "done");
  const current = remaining.find((task) => task.id === selectedId) ?? remaining[0];
  const busy = Boolean(savingId) || refreshing;

  useEffect(() => {
    if (!busy && moveFocusToTask.current) {
      moveFocusToTask.current = false;
      nextHeading.current?.focus();
    }
  }, [busy, current?.id]);

  async function save(task: Task, status: "pending" | "done") {
    if (busy) return;
    setSavingId(task.id);
    setError("");
    setFeedback("");
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not save the task. Try again.");
        return;
      }
      setSelectedId(status === "pending" ? task.id : undefined);
      moveFocusToTask.current = true;
      setFeedback(status === "done" ? "Task completed." : "Task reopened.");
      refresh(() => router.refresh());
    } catch {
      setError("Could not confirm the update. Refresh the page to check its status.");
    } finally {
      setSavingId(undefined);
    }
  }

  if (!tasks.length) return (
    <section className="rounded-2xl border border-edge bg-card p-6 sm:p-8">
      <ClipboardList className="mb-3 size-6 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold">Waiting for HR to assign tasks</h2>
      <p className="mt-1 text-sm text-muted-foreground">HR will assign your tasks here. You can start by reviewing your profile.</p>
      <Link className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/employee/profile">
        Open my profile <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );

  return (
    <div aria-busy={busy} className="space-y-4">
      <section aria-labelledby="checklist-progress" className="space-y-3 rounded-2xl border border-edge bg-card px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="checklist-progress" className="text-sm font-semibold">Checklist progress</h2>
          <p className="text-sm tabular-nums text-muted-foreground">{completed.length} of {tasks.length} complete</p>
        </div>
        <progress aria-labelledby="checklist-progress" className="block h-2 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary" max={tasks.length} value={completed.length} />
      </section>

      {current ? (
        <section aria-labelledby="current-onboarding-task" className="space-y-4 rounded-2xl border border-edge bg-card p-5 sm:p-7">
          <div>
            <p className="text-xs font-semibold text-primary">{current.id === remaining[0].id ? "Your next task" : "Selected task"}</p>
            <h2 ref={nextHeading} tabIndex={-1} id="current-onboarding-task" className="mt-1 break-words text-xl font-semibold outline-none sm:text-2xl">{current.name}</h2>
            {current.dueBy && <p className={`mt-1 text-sm ${istDateKey(current.dueBy) < today ? "text-destructive" : "text-muted-foreground"}`}>
              {istDateKey(current.dueBy) < today ? "Overdue since" : "Due"} {formatCalendarDate(istDateKey(current.dueBy), locale)}
            </p>}
          </div>
          <div className="max-w-prose text-sm leading-6 text-muted-foreground"><TaskGuidance name={current.name} resources={resources} /></div>
          <Button type="button" disabled={busy} loading={savingId === current.id} onClick={() => void save(current, "done")}>
            <CheckCircle2 aria-hidden="true" className="size-4" /> Mark task complete
          </Button>
        </section>
      ) : (
        <section className="rounded-2xl border border-edge bg-card p-5 sm:p-7">
          <CheckCircle2 className="mb-3 size-6 text-primary" aria-hidden="true" />
          <h2 ref={nextHeading} tabIndex={-1} className="text-xl font-semibold outline-none">Checklist complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">HR can see your completed tasks. For any required document reviews or signatures, check the outcome with HR.</p>
          <Link href="/employee" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Go to my dashboard <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-3 text-sm text-destructive">{error}</p>}
      <p className="sr-only" role="status">{feedback}</p>

      {remaining.length > 1 && (
        <section aria-labelledby="other-onboarding-tasks" className="rounded-2xl border border-edge bg-card">
          <h2 id="other-onboarding-tasks" className="border-b border-edge px-5 py-3 text-sm font-semibold">Other tasks to do</h2>
          <ul className="divide-y divide-edge">
            {remaining.filter((task) => task.id !== current?.id).map((task) => (
              <li key={task.id}>
                <button type="button" disabled={busy} onClick={() => {
                  moveFocusToTask.current = true;
                  setSelectedId(task.id);
                  setError("");
                }} className="flex min-h-12 w-full items-center gap-3 px-5 py-2 text-left text-sm hover:bg-tint">
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words">{task.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <details className="rounded-2xl border border-edge bg-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Completed tasks ({completed.length})</summary>
          <ul className="divide-y divide-edge border-t border-edge">
            {completed.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{task.name}</p>
                  {task.completedAt && <time dateTime={task.completedAt.toISOString()} className="text-xs text-muted-foreground">
                    {formatCalendarDate(istDateKey(task.completedAt), locale)}
                  </time>}
                </div>
                <Button type="button" variant="ghost" aria-label={`Reopen ${task.name}`} disabled={busy} loading={savingId === task.id} onClick={() => void save(task, "pending")}>Reopen</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
