"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface Dept {
  id: string;
  name: string;
  description: string | null;
  _count: { employees: number };
}

export function DepartmentsManager({ departments }: { departments: Dept[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Dept | "new" | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = { name: form.get("name"), description: form.get("description") };
    try {
      const res = await fetch(editing && typeof editing === "object" ? `/api/departments/${editing.id}` : "/api/departments", {
        method: editing && typeof editing === "object" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save");
        return;
      }
      toast("success", editing ? "Department updated" : "Department created");
      setEditing(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(dept: Dept) {
    setLoading(true);
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Department removed");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isNew = editing === "new";

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{departments.length} departments</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> New department
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => (
          <div key={d.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-[15px] font-semibold">{d.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{d.description || "No description"}</p>
              </div>
              <span className="rounded-full bg-tint-strong px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {d._count.employees}
              </span>
            </div>
            <div className="mt-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="text-rose-300" onClick={() => remove(d)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New department" : `Edit ${editing && typeof editing === "object" ? editing.name : ""}`}
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Department name">
            <Input name="name" required defaultValue={editing && typeof editing === "object" ? editing.name : ""} />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={editing && typeof editing === "object" ? editing.description ?? "" : ""} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
