"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Clock3, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface Shift {
  id: string;
  name: string;
  code: string | null;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  isNightShift: boolean;
  isDefault: boolean;
  _count: { employees: number };
}

export function ShiftsManager({ shifts }: { shifts: Shift[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      code: form.get("code"),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      graceMinutes: form.get("graceMinutes"),
      isNightShift: form.get("isNightShift") === "on",
    };
    try {
      const res = await fetch(editing && typeof editing === "object" ? `/api/shifts/${editing.id}` : "/api/shifts", {
        method: editing && typeof editing === "object" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save shift");
        return;
      }
      toast("success", editing ? "Shift updated" : "Shift created");
      setEditing(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(shift: Shift) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Shift removed");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isNew = editing === "new";

  return (
    <>
      <div id="shifts-manager" className="flex scroll-mt-4 items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{shifts.length} shifts</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> New shift
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {shifts.map((s) => (
          <div key={s.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-[15px] font-semibold">
                  {s.name}
                  {s.isDefault && <Badge tone="violet" className="ml-2">Default</Badge>}
                  {s.isNightShift && <Badge tone="info" className="ml-1.5"><Moon className="h-3 w-3" /> Night</Badge>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {s.code ? `${s.code} · ` : ""}{s._count.employees} assigned
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-tint px-2.5 py-1.5">
                <Clock3 className="h-3.5 w-3.5 text-indigo-300" />
                <span className="font-mono text-[12.5px] font-semibold">{s.startTime} – {s.endTime}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11.5px] text-muted-foreground">
                {s.graceMinutes} min grace for late marking
              </p>
              <div className="flex gap-1.5 opacity-100 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                {!s.isDefault && (
                  <Button size="sm" variant="outline" className="text-rose-300" onClick={() => remove(s)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New shift" : `Edit ${editing && typeof editing === "object" ? editing.name : ""}`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shift name">
              <Input name="name" required defaultValue={editing && typeof editing === "object" ? editing.name : ""} />
            </Field>
            <Field label="Shift code">
              <Input name="code" defaultValue={editing && typeof editing === "object" ? editing.code ?? "" : ""} placeholder="e.g. GEN" />
            </Field>
            <Field label="Start time">
              <Input name="startTime" type="time" required defaultValue={editing && typeof editing === "object" ? editing.startTime : "09:00"} />
            </Field>
            <Field label="End time">
              <Input name="endTime" type="time" required defaultValue={editing && typeof editing === "object" ? editing.endTime : "18:00"} />
            </Field>
            <Field label="Grace minutes" hint="Punch-in delay allowed before marking late">
              <Input name="graceMinutes" type="number" min={0} defaultValue={editing && typeof editing === "object" ? editing.graceMinutes : 15} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                name="isNightShift"
                defaultChecked={editing && typeof editing === "object" ? editing.isNightShift : false}
                className="h-4 w-4 rounded border-input accent-indigo-500"
              />
              Night shift
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
