"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
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
  const [confirmDelete, setConfirmDelete] = useState<Dept | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const matches = departments.filter((department) => department.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
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
        setError(data.error ?? "Could not save the department.");
        return;
      }
      toast("success", editing === "new" ? "Department created" : "Department updated");
      setEditing(null);
      router.refresh();
    } catch {
      setError("Could not save the department. Try again.");
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
      setConfirmDelete(null);
      router.refresh();
    } catch {
      toast("error", "Could not delete the department. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isNew = editing === "new";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        {departments.length > 0 ? <Input aria-label="Search departments" placeholder="Search departments" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" /> : <p className="text-sm text-muted-foreground">Departments</p>}
        <Button size="sm" onClick={() => { setError(""); setEditing("new"); }}>
          <Plus className="h-3.5 w-3.5" /> New department
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((d) => (
          <div key={d.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-[15px] font-semibold">{d.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{d.description || "No description"}</p>
              </div>
              <Link href={`/admin/employee-master?department=${encodeURIComponent(d.id)}`} className="shrink-0 rounded-lg border border-edge px-2.5 py-1 text-xs hover:bg-tint">{d._count.employees} employees</Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setError(""); setEditing(d); }}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="text-rose-300" aria-label={`Delete ${d.name}`} onClick={() => setConfirmDelete(d)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {!matches.length && departments.length > 0 && <p className="col-span-full p-4 text-sm text-muted-foreground">No departments match your search.</p>}
        {departments.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-edge bg-tint/40 px-5 py-10 text-center">
            <p className="font-display text-sm font-semibold">No departments yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Create your first department to organize employees into teams.</p>

          </div>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => !loading && setEditing(null)}
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
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={loading} onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? "department"}?`}
        description={
          confirmDelete && confirmDelete._count.employees > 0
            ? `Reassign the ${confirmDelete._count.employees} employees in this department before deleting it.`
            : "This cannot be undone."
        }
        busy={loading}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />
    </>
  );
}
