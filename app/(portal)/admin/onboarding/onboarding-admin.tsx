"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useRouteAction } from "@/components/use-route-action";
import { istDateKey } from "@/lib/ist";
import { getOnboardingHandoff, starterOnboardingTasks, type OnboardingSignIn } from "@/lib/onboarding-tasks";
import { formatCalendarDate } from "@/lib/workspace-time";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}

interface Task {
  id: string;
  name: string;
  status: string;
  dueBy: Date | null;
  completedAt: Date | null;
  employee: Employee;
}

function checklistHref(employeeId: string) {
  return `/admin/onboarding?employee=${encodeURIComponent(employeeId)}`;
}

function isOverdue(task: Task, today: string) {
  return task.status !== "done" && Boolean(task.dueBy && istDateKey(task.dueBy) < today);
}

const handoffInstructions = {
  history: "This checklist belongs to an account that is unavailable for onboarding.",
  assign: "Assign the first tasks before sharing employee sign-in details.",
  setup: "The employee needs portal access to open their assigned tasks.",
  "first-sign-in": "A temporary password is set. HR can share it privately, then the employee sets their own password.",
  tasks: "The employee can work through the assigned checklist. HR can track saved progress here.",
  complete: "Every assigned task is marked complete. Follow your HR process for document reviews and signatures.",
};

export function OnboardingAdmin({ tasks, employees, today, locale, initialEmployeeId, focused, signInById }: {
  tasks: Task[];
  employees: Employee[];
  today: string;
  locale: string;
  initialEmployeeId?: string;
  focused: boolean;
  signInById: Partial<Record<string, OnboardingSignIn>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useRouteAction("assign");
  const [savingId, setSavingId] = useState<string>();
  const [refreshing, refresh] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [formError, setFormError] = useState("");
  const busy = Boolean(savingId) || refreshing;
  const activeIds = useMemo(() => new Set(employees.map(({ id }) => id)), [employees]);
  const byEmployee = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = map.get(task.employee.id);
      if (list) list.push(task);
      else map.set(task.employee.id, [task]);
    }
    return [...map.values()].map((list) => {
      const employee = list[0].employee;
      const done = list.filter((task) => task.status === "done").length;
      const state: "complete" | "overdue" | "open" = done === list.length ? "complete" : list.some((task) => isOverdue(task, today)) ? "overdue" : "open";
      const handoff = getOnboardingHandoff({ active: activeIds.has(employee.id), total: list.length, done, signIn: signInById[employee.id] });
      return { employee, done, count: list.length, state, handoff };
    }).sort((a, b) => {
      const priority = { overdue: 0, open: 1, complete: 2 };
      return priority[a.state] - priority[b.state]
        || a.employee.firstName.localeCompare(b.employee.firstName, locale)
        || a.employee.lastName.localeCompare(b.employee.lastName, locale);
    });
  }, [tasks, today, locale, activeIds, signInById]);

  const matches = byEmployee.filter(({ employee, state }) =>
    `${employee.firstName} ${employee.lastName} ${employee.employeeNumber}`.toLowerCase().includes(query.trim().toLowerCase())
    && (status === "all" || state === status || (status === "open" && state === "overdue")));
  const needsAction = byEmployee.filter(({ state }) => state !== "complete").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const orderedTasks = [...tasks].sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  const focusedEmployee = employees.find(({ id }) => id === initialEmployeeId);
  const handoff = getOnboardingHandoff({
    active: Boolean(focusedEmployee), total: tasks.length, done, signIn: focusedEmployee && signInById[focusedEmployee.id],
  });

  async function toggle(task: Task) {
    if (busy) return;
    setSavingId(task.id);
    const complete = task.status !== "done";
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: complete ? "done" : "pending" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast("error", data?.error ?? "Could not update the task.");
        return;
      }
      toast("success", complete ? "Task completed" : "Task reopened");
      refresh(() => router.refresh());
    } catch {
      toast("error", "Could not confirm the update. Refresh the checklist to check its status.");
    } finally {
      setSavingId(undefined);
    }
  }

  async function remove(task: Task) {
    if (busy) return;
    setSavingId(task.id);
    try {
      const res = await fetch(`/api/onboarding/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast("error", data?.error ?? "Could not remove the task.");
        return;
      }
      setDeleting(null);
      toast("success", "Task removed");
      refresh(() => router.refresh());
    } catch {
      toast("error", "Could not confirm removal. Refresh the checklist to check its status.");
    } finally {
      setSavingId(undefined);
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId") ?? "");
    const names = String(form.get("names") ?? "").split("\n").map((name) => name.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, names, dueBy: form.get("dueBy") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Could not assign the tasks.");
        return;
      }
      toast("success", data.created ? `${data.created} tasks assigned${data.skipped ? ` · ${data.skipped} already assigned` : ""}` : "These tasks are already assigned.");
      if (focused) {
        setAddOpen(false);
        refresh(() => router.refresh());
      } else {
        refresh(() => router.push(checklistHref(employeeId)));
      }
    } catch {
      setFormError("Could not confirm which tasks were assigned. Review the employee’s checklist before trying again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-busy={busy} aria-labelledby="hr-checklist" className="overflow-hidden rounded-2xl border border-edge bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:items-center">
        <div>
          <h2 id="hr-checklist" className="font-semibold">{focused ? "Employee checklist" : "Checklists"}</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {focused
              ? tasks.length ? `${done} of ${tasks.length} tasks complete` : "No tasks assigned"
              : byEmployee.length ? `${needsAction} in progress · ${byEmployee.length - needsAction} complete` : "Assigned checklists appear here."}
          </p>
        </div>
        {employees.length > 0 && <Button type="button" disabled={busy} onClick={() => { setFormError(""); setAddOpen(true); }}>
          <Plus className="size-4" aria-hidden="true" /> {tasks.length && focused ? "Add tasks" : "Assign tasks"}
        </Button>}
      </div>

      {focused && (
        <div className="mx-5 mb-4 rounded-xl border border-edge bg-tint/50 px-4 py-3">
          <h3 className="text-sm font-semibold">{handoff.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{handoffInstructions[handoff.state]}</p>
          {(handoff.state === "setup" || handoff.state === "first-sign-in") && (
            <a href="#employee-sign-in" className="mt-1 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">
              View sign-in steps <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {focused && tasks.length > 0 && (
        <>
          <div className="px-5 pb-4">
            <progress aria-label="Checklist progress" className="block h-2 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary" max={tasks.length} value={done} />
          </div>
          <ul className="divide-y divide-edge border-t border-edge">
            {orderedTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                <div className="min-w-32 flex-1">
                  <p className="break-words text-sm font-medium">{task.name}</p>
                  <p className={`text-xs ${isOverdue(task, today) ? "text-destructive" : "text-muted-foreground"}`}>
                    {task.status === "done"
                      ? task.completedAt ? `Completed ${formatCalendarDate(istDateKey(task.completedAt), locale)}` : "Complete"
                      : task.dueBy ? `${isOverdue(task, today) ? "Overdue since" : "Due"} ${formatCalendarDate(istDateKey(task.dueBy), locale)}` : "To do"}
                  </p>
                </div>
                {focusedEmployee && <Button type="button" variant="outline" disabled={busy} loading={savingId === task.id && !deleting} aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.name}`} onClick={() => void toggle(task)}>
                  {task.status !== "done" && <CheckCircle2 className="size-4" aria-hidden="true" />}{task.status === "done" ? "Reopen" : "Mark complete"}
                </Button>}
                <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Remove ${task.name}`} onClick={() => setDeleting(task)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!focused && byEmployee.length > 0 && (
        <>
          <div className="grid gap-3 border-y border-edge bg-tint/50 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input type="search" aria-label="Find onboarding employee" placeholder="Find by name or employee ID" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Select aria-label="Checklist status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All checklists</option>
              <option value="open">In progress</option>
              <option value="overdue">Overdue</option>
              <option value="complete">Complete</option>
            </Select>
          </div>
          <ul className="divide-y divide-edge">
            {matches.map(({ employee, done, count, state, handoff }) => (
              <li key={employee.id}>
                <Link href={checklistHref(employee.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-tint">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold">{employee.firstName} {employee.lastName}</p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">{employee.employeeNumber} · {handoff.label}</p>
                  </div>
                  <p className={`shrink-0 text-right text-xs tabular-nums ${state === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
                    <span className="block font-medium">{state === "overdue" ? "Overdue" : state === "complete" ? "Complete" : "In progress"}</span>
                    {done}/{count} tasks
                  </p>
                  <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {!focused && matches.length === 0 && (
        <div className="grid justify-items-center gap-2 border-t border-edge p-8 text-center">
          <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {byEmployee.length ? "No checklists match these filters." : employees.length ? "Choose an employee to assign their first tasks." : "Add an active employee to start assigning tasks."}
          </p>
        </div>
      )}

      <Modal open={addOpen && employees.length > 0} onClose={() => { if (!submitting && !refreshing) setAddOpen(false); }} title="Assign onboarding tasks" size="md" placement="drawer">
        <form method="post" onSubmit={assign} className="space-y-4">
          {focusedEmployee ? (
            <div className="rounded-xl bg-tint p-3 text-sm">
              <p className="font-semibold">{focusedEmployee.firstName} {focusedEmployee.lastName}</p>
              <p className="text-muted-foreground">{focusedEmployee.employeeNumber}</p>
              <input type="hidden" name="employeeId" value={focusedEmployee.id} />
            </div>
          ) : (
            <Field label="Employee">
              <Select name="employeeId" required defaultValue="">
                <option value="">Choose an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} ({employee.employeeNumber})</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Tasks" hint="Edit the starter checklist. Add one task per line.">
            <Textarea name="names" required defaultValue={Object.values(starterOnboardingTasks).join("\n")} className="min-h-48" />
          </Field>
          <Field label="Due date" hint="Optional. Applies to every task in this batch."><Input name="dueBy" type="date" /></Field>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={submitting || refreshing} onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting || refreshing}>Assign tasks</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={deleting !== null} title="Remove onboarding task?" description={deleting?.name}
        confirmLabel="Remove task" busy={Boolean(deleting && savingId === deleting.id)}
        onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) void remove(deleting); }} />
    </section>
  );
}
