"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate, toDateKey, addDays } from "@/lib/dates";

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

const DEFAULT_TASKS = [
  "Submit PAN card",
  "Submit Aadhaar card",
  "Open & verify bank account",
  "Share bank account details (bank file)",
  "Provide joining documents (offer letter, education certs)",
  "Issue ID card / access badge",
  "Assign laptop & assets",
  "Add to company WhatsApp / HR group",
  "Set up payroll & statutory (PF/ESIC) enrollment",
  "Complete first-day orientation & policy acknowledgement",
];

export function OnboardingAdmin({ tasks, employees }: { tasks: Task[]; employees: Employee[] }) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const byEmployee = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!map.has(t.employee.id)) map.set(t.employee.id, []);
      map.get(t.employee.id)!.push(t);
    }
    return map;
  }, [tasks]);

  const totals = useMemo(() => {
    const assigned = new Set(tasks.map((t) => t.employee.id)).size;
    const done = tasks.filter((t) => t.status === "done").length;
    return { assigned, done, total: tasks.length };
  }, [tasks]);

  async function toggle(task: Task) {
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
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/onboarding/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast("error", data.error ?? "Failed to delete");
      return;
    }
    toast("success", "Task removed");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">
          {totals.assigned} employees onboarded · {totals.done}/{totals.total} tasks done
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add tasks
        </Button>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {employees.map((e) => {
          const list = byEmployee.get(e.id) ?? [];
          const done = list.filter((t) => t.status === "done").length;
          const pct = list.length ? Math.round((done / list.length) * 100) : 0;
          const recent = e.joiningDate && toDateKey(e.joiningDate) >= toDateKey(addDays(new Date(), -30));
          return (
            <div key={e.id} className="card-surface rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint-strong text-[13px] font-bold">
                  {e.firstName[0]}
                  {e.lastName[0] ?? ""}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
                    {e.firstName} {e.lastName}
                    {recent && (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-300">
                        New join
                      </span>
                    )}
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
                {list.length === 0 && (
                  <p className="rounded-lg bg-tint px-3 py-2 text-[12px] text-muted-foreground">
                    No tasks yet — add an onboarding checklist.
                  </p>
                )}
                {list.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-tint">
                    <button
                      onClick={() => toggle(t)}
                      disabled={busy === t.id}
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
                      <span className="text-[10.5px] text-muted-foreground">{formatDate(t.dueBy)}</span>
                    )}
                    <button
                      onClick={() => remove(t.id)}
                      className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-rose-300 hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {employees.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-3 py-14 text-center">
            <UserPlus className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-[13px] text-muted-foreground">Add employees first — onboarding checklists appear here.</p>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add onboarding tasks" size="md">
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const names = String(form.get("names") ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
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
                toast("error", data.error ?? "Failed to add tasks");
                return;
              }
              toast("success", `${data.created} tasks added`);
              setAddOpen(false);
              router.refresh();
            } finally {
              /* noop */
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
          <Field label="Tasks" hint="One per line — start from the template below and edit freely">
            <Textarea
              name="names"
              required
              defaultValue={DEFAULT_TASKS.join("\n")}
              className="min-h-48 font-mono text-[12.5px]"
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            {DEFAULT_TASKS.map((t) => (
              <span key={t} className="rounded-md bg-tint px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Add tasks</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
