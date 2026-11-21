"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";
import { useRouteAction } from "@/components/use-route-action";
import { istDateKey } from "@/lib/ist";
import Link from "next/link";

interface Task {
  id: string;
  name: string;
  status: string;
  dueBy: Date | null;
  completedAt: Date | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string; joiningDate: Date | null };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  joiningDate: Date | null;
}

const STARTER_CHECKLIST = [
  "Confirm personal and emergency contact details",
  "Submit required employment documents",
  "Set up work accounts and equipment",
  "Meet your manager and team",
  "Attend new-hire orientation",
  "Read the company policies",
];

export function OnboardingAdmin({ tasks, employees, today, initialEmployeeId }: { tasks: Task[]; employees: Employee[]; today: string; initialEmployeeId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useRouteAction("assign");
  const [selectedId, setSelectedId] = useState(initialEmployeeId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [formError, setFormError] = useState("");

  const byEmployee = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!map.has(t.employee.id)) map.set(t.employee.id, []);
      map.get(t.employee.id)!.push(t);
    }
    return map;
  }, [tasks]);

  const totals = useMemo(() => {
    const completed = [...byEmployee.values()].filter((list) => list.every((task) => task.status === "done")).length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { assigned: byEmployee.size, completed, done, total: tasks.length };
  }, [byEmployee, tasks]);
  const matches = [...byEmployee.values()].filter((list) => {
    const employee = list[0].employee;
    const complete = list.every((task) => task.status === "done");
    const overdue = list.some((task) => task.status !== "done" && task.dueBy && istDateKey(task.dueBy) < today);
    return `${employee.firstName} ${employee.lastName} ${employee.employeeNumber}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (status === "all" || (status === "complete" && complete) || (status === "open" && !complete) || (status === "overdue" && overdue));
  });

  async function toggle(task: Task) {
    if (busy) return;
    setBusy(task.id);
    try {
      const res = await fetch(`/api/onboarding/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
      });
      if (!res.ok) {
        const data = await res.json();
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

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/onboarding/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      setDeleting(null);
      toast("success", "Task removed");
      router.refresh();
    } catch {
      toast("error", "Could not remove the task. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">
          {totals.completed}/{totals.assigned} checklists completed · {totals.done}/{totals.total} tasks done
        </p>
        <Button size="sm" disabled={!employees.length} onClick={() => { setFormError(""); setAddOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add tasks
        </Button>
      </div>
      {byEmployee.size > 0 && <div className="flex flex-wrap gap-3 border-b border-edge px-5 py-3">
        <Input aria-label="Find onboarding employee" placeholder="Employee name or code" className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select aria-label="Checklist status" value={status} className="w-auto" onChange={(event) => setStatus(event.target.value)}><option value="all">All checklists</option><option value="open">In progress</option><option value="overdue">Overdue</option><option value="complete">Complete</option></Select>
      </div>}

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {matches.map((list) => {
          const e = list[0].employee;
          const done = list.filter((t) => t.status === "done").length;
          const pct = list.length ? Math.round((done / list.length) * 100) : 0;
          return (
            <div key={e.id} className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint-strong text-[13px] font-bold">
                  {e.firstName[0]}
                  {e.lastName[0] ?? ""}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
                    <Link href={`/admin/employee-master?employee=${encodeURIComponent(e.id)}#employee-record`} className="hover:text-primary hover:underline">{e.firstName} {e.lastName}</Link>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {e.employeeNumber}
                    {e.joiningDate ? ` · joined ${formatDate(e.joiningDate)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[15px] font-bold">{pct}%</p>
                  <p className="text-[10.5px] text-muted-foreground">{done}/{list.length} done</p>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-tint-strong">
                <div
                  className="h-full rounded-full bg-gradient-brand transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 space-y-1">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-tint">
                    <button
                      onClick={() => toggle(t)}
                      disabled={busy !== null}
                      aria-label={`${t.status === "done" ? "Reopen" : "Complete"} ${t.name}`}
                      className="text-muted-foreground transition-colors hover:text-emerald-300"
                    >
                      {t.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <span className={`flex-1 text-[12.5px] ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                      {t.name}
                    </span>
                    {t.dueBy && (
                      <span className={`text-xs ${t.status !== "done" && istDateKey(t.dueBy) < today ? "text-destructive" : "text-muted-foreground"}`}>{t.status !== "done" && istDateKey(t.dueBy) < today ? "Overdue · " : ""}{formatDate(t.dueBy)}</span>
                    )}
                    <button
                      onClick={() => setDeleting(t)}
                      aria-label={`Remove ${t.name}`}
                      className="text-muted-foreground hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {matches.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-3 py-14 text-center">
            <UserPlus className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-[13px] text-muted-foreground">{byEmployee.size > 0 ? "No checklists match the selected filters." : employees.length ? "Assign a checklist to get started." : "Add an employee to start assigning onboarding tasks."}</p>
          </div>
        )}
      </div>

      <Modal open={addOpen && employees.length > 0} onClose={() => !submitting && setAddOpen(false)} title="Assign onboarding tasks" size="md" placement="drawer">
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (submitting) return;
            setFormError("");
            const form = new FormData(e.currentTarget);
            const names = String(form.get("names") ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            setSubmitting(true);
            try {
              const res = await fetch("/api/onboarding", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  employeeId: form.get("employeeId"),
                  names,
                  dueBy: form.get("dueBy"),
                }),
              });
              const data = await res.json();
              if (!res.ok) {
                setFormError(data.error ?? "Could not assign the tasks.");
                return;
              }
              toast("success", `${data.created} tasks added${data.skipped ? ` · ${data.skipped} already existed` : ""}`);
              setAddOpen(false);
              setSelectedId(initialEmployeeId ?? "");
              router.refresh();
            } catch {
              setFormError("Could not assign the tasks. Try again.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <Field label="Employee">
            <Select name="employeeId" required value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeNumber})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due by (optional)">
            <Input name="dueBy" type="date" />
          </Field>
          <Field label="Tasks" hint="Edit the starter checklist with one task per line.">
            <Textarea
              name="names"
              required
              defaultValue={STARTER_CHECKLIST.join("\n")}
              className="min-h-48 font-mono text-[12.5px]"
            />
          </Field>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={submitting}>Assign tasks</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Remove onboarding task?"
        description={deleting?.name}
        confirmLabel="Remove task"
        busy={busy === deleting?.id}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting.id)}
      />
    </div>
  );
}
