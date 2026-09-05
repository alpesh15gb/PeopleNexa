"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, MapPin, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
  isDefault: boolean;
  _count: { employees: number };
}

export function BranchesManager({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      code: form.get("code"),
      address: form.get("address"),
      latitude: form.get("latitude"),
      longitude: form.get("longitude"),
      geofenceRadius: form.get("geofenceRadius"),
    };
    try {
      const res = await fetch(editing && typeof editing === "object" ? `/api/branches/${editing.id}` : "/api/branches", {
        method: editing && typeof editing === "object" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save branch");
        return;
      }
      toast("success", editing ? "Branch updated" : "Branch created");
      setEditing(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(branch: Branch) {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Branch removed");
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      toast("error", "Geolocation is not supported in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const form = document.getElementById("branch-form") as HTMLFormElement | null;
        if (form) {
          (form.elements.namedItem("latitude") as HTMLInputElement).value = String(pos.coords.latitude.toFixed(6));
          (form.elements.namedItem("longitude") as HTMLInputElement).value = String(pos.coords.longitude.toFixed(6));
          toast("success", "Location captured — use it as the geofence center");
        }
      },
      () => toast("error", "Could not get your location"),
      { enableHighAccuracy: true }
    );
  }

  const isNew = editing === "new";

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{branches.length} branches</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> New branch
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => (
          <div key={b.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-[15px] font-semibold">
                  {b.name}
                  {b.isDefault && <Badge tone="violet" className="ml-2">Default</Badge>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {b.code} · {b._count.employees} employees
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <MapPin className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{b.address || "No address"}</p>
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className="rounded-md bg-tint px-2 py-1 font-mono">
                {b.latitude != null ? `${b.latitude.toFixed(4)}, ${b.longitude?.toFixed(4)}` : "No coordinates"}
              </span>
              <span className="rounded-md bg-tint px-2 py-1">{b.geofenceRadius}m</span>
            </div>
            <div className="mt-3 flex gap-1.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
              <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              {!b.isDefault && (
                <Button size="sm" variant="outline" className="text-rose-300" onClick={() => setConfirmDelete(b)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New branch" : `Edit ${editing && typeof editing === "object" ? editing.name : ""}`}
        description="Set coordinates and a geofence radius to verify employee clock-ins by location."
      >
        <form id="branch-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch name">
              <Input name="name" required defaultValue={editing && typeof editing === "object" ? editing.name : ""} />
            </Field>
            <Field label="Branch code">
              <Input name="code" required defaultValue={editing && typeof editing === "object" ? editing.code : ""} placeholder="e.g. MAIN" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input name="address" defaultValue={editing && typeof editing === "object" ? editing.address ?? "" : ""} />
            </Field>
            <Field label="Latitude">
              <Input name="latitude" type="number" step="any" defaultValue={editing && typeof editing === "object" ? editing.latitude ?? "" : ""} />
            </Field>
            <Field label="Longitude">
              <Input name="longitude" type="number" step="any" defaultValue={editing && typeof editing === "object" ? editing.longitude ?? "" : ""} />
            </Field>
            <Field label="Geofence radius (meters)">
              <Input name="geofenceRadius" type="number" min={10} defaultValue={editing && typeof editing === "object" ? editing.geofenceRadius : 200} />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={useMyLocation} className="w-full">
                <LocateFixed className="h-4 w-4" /> Use my location
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? "branch"}?`}
        description={
          confirmDelete && confirmDelete._count.employees > 0
            ? `${confirmDelete._count.employees} employee(s) are assigned to this branch. They will become unassigned.`
            : "This cannot be undone."
        }
        busy={loading}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />
    </>
  );
}
