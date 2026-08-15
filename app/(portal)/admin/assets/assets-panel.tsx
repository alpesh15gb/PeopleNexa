"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, History, ArrowRightLeft, Undo2, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

interface Assignee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: { name: string } | null;
}

interface AssetRow {
  id: string;
  name: string;
  category: string;
  tag: string | null;
  serialNumber: string | null;
  value: number | null;
  purchaseDate: string | Date | null;
  status: string;
  notes: string | null;
  assignee: Assignee | null;
}

interface Counts {
  total: number;
  available: number;
  assigned: number;
  maintenance: number;
  lost: number;
}

const CATEGORIES = ["laptop", "phone", "id_card", "vehicle", "device", "furniture", "other"] as const;
const STATUSES = ["available", "assigned", "maintenance", "retired", "lost"] as const;

const categoryTone: Record<string, "info" | "violet" | "warning" | "success" | "neutral"> = {
  laptop: "info",
  phone: "violet",
  id_card: "warning",
  vehicle: "success",
  device: "neutral",
  furniture: "neutral",
  other: "neutral",
};

const categoryLabel = (c: string) => c.replace(/_/g, " ");

interface FormState {
  name: string;
  category: string;
  tag: string;
  serialNumber: string;
  value: string;
  purchaseDate: string;
  status: string;
  notes: string;
}

const emptyForm: FormState = {
  name: "",
  category: "laptop",
  tag: "",
  serialNumber: "",
  value: "",
  purchaseDate: "",
  status: "available",
  notes: "",
};

export function AssetsPanel({
  rows,
  counts,
  employees,
}: {
  rows: AssetRow[];
  counts: Counts;
  employees: Employee[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [assigning, setAssigning] = useState<AssetRow | null>(null);
  const [assignEmp, setAssignEmp] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const [history, setHistory] = useState<{
    asset: AssetRow;
    entries: Array<{ id: string; employee: Assignee; assignedAt: Date; returnedAt: Date | null; note: string | null }>;
  } | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const [deleting, setDeleting] = useState<AssetRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((a) => {
      if (catFilter !== "all" && a.category !== catFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.name, a.tag, a.serialNumber, a.assignee?.firstName, a.assignee?.lastName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, catFilter, statusFilter]);

  const stats = [
    { label: "Total assets", value: counts.total, cls: "text-foreground", icon: <Package className="h-4 w-4 text-indigo-300" /> },
    { label: "Available", value: counts.available, cls: "text-emerald-300", icon: <span className="h-2 w-2 rounded-full bg-emerald-400" /> },
    { label: "Assigned", value: counts.assigned, cls: "text-sky-300", icon: <span className="h-2 w-2 rounded-full bg-sky-400" /> },
    { label: "Maintenance", value: counts.maintenance, cls: "text-amber-300", icon: <span className="h-2 w-2 rounded-full bg-amber-400" /> },
    { label: "Lost", value: counts.lost, cls: "text-rose-300", icon: <span className="h-2 w-2 rounded-full bg-rose-400" /> },
  ];

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(asset: AssetRow) {
    setEditing(asset);
    setForm({
      name: asset.name,
      category: asset.category,
      tag: asset.tag ?? "",
      serialNumber: asset.serialNumber ?? "",
      value: asset.value != null ? String(asset.value) : "",
      purchaseDate: asset.purchaseDate ? String(asset.purchaseDate).slice(0, 10) : "",
      status: asset.status,
      notes: asset.notes ?? "",
    });
    setFormOpen(true);
  }

  async function saveAsset() {
    if (!form.name.trim()) {
      toast("error", "Asset name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/assets/${editing.id}` : "/api/assets";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          tag: form.tag || null,
          serialNumber: form.serialNumber || null,
          value: form.value ? Number(form.value) : null,
          purchaseDate: form.purchaseDate || null,
          status: form.status,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save asset");
        return;
      }
      toast("success", editing ? "Asset updated" : "Asset added to inventory");
      setFormOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function assignAsset() {
    if (!assigning) return;
    if (!assignEmp) {
      toast("error", "Select an employee to assign the asset to");
      return;
    }
    setAssignBusy(true);
    try {
      const res = await fetch(`/api/assets/${assigning.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: assignEmp, note: assignNote || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to assign asset");
        return;
      }
      toast("success", `Asset assigned to ${employees.find((e) => e.id === assignEmp)?.firstName ?? "employee"}`);
      setAssigning(null);
      setAssignEmp("");
      setAssignNote("");
      router.refresh();
    } finally {
      setAssignBusy(false);
    }
  }

  async function returnAsset(asset: AssetRow) {
    const res = await fetch(`/api/assets/${asset.id}/return`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast("error", data.error ?? "Failed to return asset");
      return;
    }
    toast("success", `${asset.name} returned to the pool`);
    router.refresh();
  }

  async function openHistory(asset: AssetRow) {
    setHistoryBusy(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to load history");
        return;
      }
      setHistory({
        asset,
        entries: (data.asset.assignments ?? []).map((x: { id: string; employee: Assignee; assignedAt: string; returnedAt: string | null; note: string | null }) => ({
          id: x.id,
          employee: x.employee,
          assignedAt: new Date(x.assignedAt),
          returnedAt: x.returnedAt ? new Date(x.returnedAt) : null,
          note: x.note,
        })),
      });
    } finally {
      setHistoryBusy(false);
    }
  }

  async function deleteAsset() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/assets/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Failed to delete asset");
        return;
      }
      toast("success", "Asset removed");
      setDeleting(null);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card-surface rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-2">
              {s.icon}
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
            <p className={`mt-1.5 font-display text-xl font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card-surface flex flex-wrap items-center gap-3 rounded-xl px-4 py-3.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, tag, serial, assignee…"
            className="pl-9"
          />
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-40">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Add asset
        </Button>
      </div>

      {/* Table */}
      <div className="card-surface overflow-hidden rounded-xl">
        <Table>
          <THead>
            <TR>
              <TH>Asset</TH>
              <TH className="hidden md:table-cell">Category</TH>
              <TH className="hidden lg:table-cell">Serial</TH>
              <TH className="text-right">Value</TH>
              <TH>Assignee</TH>
              <TH>Status</TH>
              <TH className="w-44" />
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <Package className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-[13.5px] text-muted-foreground">No assets match your filters.</p>
                  </div>
                </TD>
              </TR>
            )}
            {filtered.map((a) => (
              <TR key={a.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-medium">{a.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{a.tag ?? "no tag"}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden md:table-cell">
                  <Badge tone={categoryTone[a.category] ?? "neutral"} className="capitalize">
                    {categoryLabel(a.category)}
                  </Badge>
                </TD>
                <TD className="hidden font-mono text-[12.5px] text-muted-foreground lg:table-cell">
                  {a.serialNumber ?? "—"}
                </TD>
                <TD className="text-right font-mono text-[13px]">{a.value != null ? formatMoney(a.value) : "—"}</TD>
                <TD>
                  {a.assignee ? (
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-[10px] font-bold text-white">
                        {(a.assignee.firstName[0] ?? "") + (a.assignee.lastName[0] ?? "")}
                      </div>
                      <div className="leading-tight">
                        <p className="text-[13px] font-medium">{a.assignee.firstName} {a.assignee.lastName}</p>
                        <p className="text-[11px] text-muted-foreground">{a.assignee.employeeNumber}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/60">—</span>
                  )}
                </TD>
                <TD><StatusPill status={a.status} /></TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    {a.status !== "assigned" ? (
                      <Button size="sm" variant="outline" onClick={() => { setAssigning(a); setAssignEmp(""); setAssignNote(""); }}>
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Assign
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => returnAsset(a)}>
                        <Undo2 className="h-3.5 w-3.5" /> Return
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" loading={historyBusy && history?.asset.id === a.id} onClick={() => openHistory(a)}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Create / edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit asset" : "Add asset"}
        description={editing ? `Update ${editing.name}` : "Add a new asset to company inventory"}
      >
        <div className="space-y-4">
          <Field label="Asset name *">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='e.g. MacBook Pro 14"' />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Asset tag">
              <Input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="AST-009" />
            </Field>
            <Field label="Serial number">
              <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="S/N" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Value (₹)">
              <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="50000" />
            </Field>
            <Field label="Purchase date">
              <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Condition, warranty, location…" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={saveAsset}>
              {editing ? "Save changes" : "Add asset"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign modal */}
      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Assign asset"
        description={assigning ? `${assigning.name}${assigning.tag ? ` (${assigning.tag})` : ""}` : ""}
      >
        <div className="space-y-4">
          <Field label="Employee *">
            <Select value={assignEmp} onChange={(e) => setAssignEmp(e.target.value)}>
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} · {e.employeeNumber} · {e.department?.name ?? "—"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="e.g. Primary work laptop" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button>
            <Button loading={assignBusy} onClick={assignAsset}>
              <ArrowRightLeft className="h-3.5 w-3.5" /> Assign
            </Button>
          </div>
        </div>
      </Modal>

      {/* History modal */}
      <Modal
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Assignment history"
        description={history ? `${history.asset.name}${history.asset.tag ? ` (${history.asset.tag})` : ""}` : ""}
      >
        {history && (
          <div className="space-y-3">
            {history.entries.length === 0 && (
              <p className="py-4 text-center text-[13px] text-muted-foreground">No assignments yet.</p>
            )}
            {history.entries.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-xl border border-edge bg-tint px-3.5 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[10px] font-bold text-white">
                  {(e.employee.firstName[0] ?? "") + (e.employee.lastName[0] ?? "")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {e.employee.firstName} {e.employee.lastName}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{e.employee.employeeNumber}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {formatDate(e.assignedAt)} → {e.returnedAt ? formatDate(e.returnedAt) : "currently assigned"}
                  </p>
                  {e.note && <p className="mt-1 text-[12px] text-muted-foreground/80">{e.note}</p>}
                </div>
                {e.returnedAt ? (
                  <Badge tone="neutral">returned</Badge>
                ) : (
                  <Badge tone="info">active</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete asset?" size="sm">
        {deleting && (
          <div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Delete <span className="font-medium text-foreground">{deleting.name}</span> from inventory? This also
              removes its assignment history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" loading={deleteBusy} onClick={deleteAsset}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
