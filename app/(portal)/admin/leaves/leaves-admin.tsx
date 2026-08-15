"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

interface Request {
  id: string;
  days: number;
  reason: string | null;
  status: string;
  fromDate: Date;
  toDate: Date;
  appliedAt: Date;
  leaveType: { name: string; color: string };
  employee: { firstName: string; lastName: string; employeeNumber: string };
}

interface Type {
  id: string;
  name: string;
  code: string;
  maxDays: number;
  color: string;
  isCarryForward: boolean;
  requiresApproval: boolean;
}

export function LeavesAdmin({ requests, types }: { requests: Request[]; types: Type[] }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"requests" | "types">("requests");
  const [busy, setBusy] = useState<string | null>(null);
  const [typeModal, setTypeModal] = useState<Type | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  async function review(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/leaves/requests/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to update");
        return;
      }
      toast("success", status === "approved" ? "Leave approved" : "Leave rejected");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const editing = typeModal && typeof typeModal === "object" ? typeModal : null;
    const payload = {
      name: form.get("name"),
      code: form.get("code"),
      maxDays: form.get("maxDays"),
      isCarryForward: form.get("isCarryForward") === "on",
      requiresApproval: form.get("requiresApproval") === "on" || form.get("requiresApproval") === null,
      color: form.get("color"),
    };
    try {
      const res = await fetch(editing ? `/api/leaves/types/${editing.id}` : "/api/leaves/types", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save");
        return;
      }
      toast("success", editing ? "Leave type updated" : "Leave type created");
      setTypeModal(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeType(t: Type) {
    const res = await fetch(`/api/leaves/types/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast("error", data.error ?? "Failed to delete");
      return;
    }
    toast("success", "Leave type removed");
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 pt-3">
        <div className="flex gap-1">
          {([
            ["requests", `Requests${pending ? ` (${pending})` : ""}`],
            ["types", "Leave types"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative rounded-t-lg px-4 py-2.5 text-[13px] font-medium transition-colors ${
                tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {tab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-brand" />}
            </button>
          ))}
        </div>
        {tab === "types" && (
          <Button size="sm" onClick={() => setTypeModal("new")}>
            <Plus className="h-3.5 w-3.5" /> New type
          </Button>
        )}
      </div>

      {tab === "requests" ? (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH className="hidden md:table-cell">Dates</TH>
              <TH>Days</TH>
              <TH className="hidden lg:table-cell">Reason</TH>
              <TH>Status</TH>
              <TH className="w-28" />
            </TR>
          </THead>
          <TBody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-muted-foreground">
                  No leave requests yet.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="text-[13.5px] font-medium">
                      {r.employee.firstName} {r.employee.lastName}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">{r.employee.employeeNumber}</p>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.color }} />
                      {r.leaveType.name}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <span className="text-[13px] text-muted-foreground">
                      {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                    </span>
                  </TD>
                  <TD className="font-semibold">{r.days}d</TD>
                  <TD className="hidden max-w-[220px] lg:table-cell">
                    <span className="block truncate text-[13px] text-muted-foreground">{r.reason || "—"}</span>
                  </TD>
                  <TD><StatusPill status={r.status} /></TD>
                  <TD>
                    {r.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="success" loading={busy === r.id} onClick={() => review(r.id, "approved")}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => review(r.id, "rejected")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        {r.status === "approved" ? "Approved" : "Rejected"}
                      </span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <div key={t.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <p className="font-display text-[15px] font-semibold">{t.name}</p>
                <span className="rounded-md bg-tint-strong px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {t.code}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {t.maxDays} days · {t.isCarryForward ? "carry forward" : "no carry forward"} ·{" "}
                {t.requiresApproval ? "approval required" : "auto-approved"}
              </p>
              <div className="mt-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="sm" variant="outline" onClick={() => setTypeModal(t)}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="text-rose-300" onClick={() => removeType(t)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={typeModal !== null}
        onClose={() => setTypeModal(null)}
        title={typeModal === "new" ? "New leave type" : `Edit ${typeModal !== null && typeof typeModal === "object" ? typeModal.name : ""}`}
        size="sm"
      >
        <form onSubmit={saveType} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.name : ""} />
            </Field>
            <Field label="Code">
              <Input name="code" required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.code : ""} placeholder="e.g. CL" />
            </Field>
            <Field label="Max days / year">
              <Input name="maxDays" type="number" min={1} required defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.maxDays : 10} />
            </Field>
            <Field label="Color">
              <Input name="color" type="color" defaultValue={typeModal !== null && typeof typeModal === "object" ? typeModal.color : "#3b82f6"} className="h-10 p-1" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" name="isCarryForward" defaultChecked={typeModal !== null && typeof typeModal === "object" ? typeModal.isCarryForward : false} className="h-4 w-4 accent-indigo-500" />
            Carry forward unused days
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" name="requiresApproval" defaultChecked={typeModal !== null && typeof typeModal === "object" ? typeModal.requiresApproval : true} className="h-4 w-4 accent-indigo-500" />
            Requires admin approval
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setTypeModal(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
