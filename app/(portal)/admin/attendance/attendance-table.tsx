"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListChecks, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface PunchRow {
  id: string;
  time: string;
  source: string;
  type: string;
  deviceSn?: string | null;
}

interface Row {
  employeeId: string;
  employeeNumber: string;
  name: string;
  department: string;
  branch: string;
  shift: string;
  record: {
    id: string;
    punchIn: string;
    punchOut: string;
    lateMinutes: number;
    status: string;
    note: string | null;
    reviewStatus: string | null;
    punches: PunchRow[] | null;
  } | null;
  leave: { type: string; color: string } | null;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const fmtIST = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const fmtISTFull = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export function AttendanceTable({ rows, date, branchId, query, status: statusFilter, page, pageSize, totalEmployees, totalPages }: { rows: Row[]; date: string; branchId: string; query: string; status: string; page: number; pageSize: number; totalEmployees: number; totalPages: number }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState<Row["record"] | null>(null);
  const [newTime, setNewTime] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function save(recordId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/attendance/${recordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to update");
        return;
      }
      toast("success", "Attendance status updated");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function refreshRecord(recordId: string) {
    const res = await fetch(`/api/attendance/${recordId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.record) setCorrection(data.record);
    }
    router.refresh();
  }

  async function addPunch() {
    if (!correction) return;
    if (!newTime) {
      toast("error", "Pick a time first");
      return;
    }
    const res = await fetch(`/api/attendance/${correction.id}/punches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: newTime.replace("T", " ") }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toast("error", data.error ?? "Failed to add punch");
      return;
    }
    toast("success", "Punch added — day re-derived");
    setNewTime("");
    await refreshRecord(correction.id);
  }

  async function deletePunch(punchId: string) {
    if (!correction) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/attendance/${correction.id}/punches?punchId=${punchId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast("error", data.error ?? "Failed to delete punch");
        return;
      }
      toast("success", "Punch removed — day re-derived");
      setDeleteTarget(null);
      await refreshRecord(correction.id);
    } finally {
      setDeleteBusy(false);
    }
  }

  const pageUrl = (nextPage: number) => {
    const params = new URLSearchParams({ date, page: String(nextPage), size: String(pageSize) });
    if (branchId) params.set("branch", branchId);
    if (statusFilter) params.set("status", statusFilter);
    if (query) params.set("q", query);
    return `/admin/attendance?${params.toString()}`;
  };

  return (
    <>
      <div className="border-b border-edge px-5 py-3">
        <form action="/admin/attendance" className="flex max-w-xl gap-2">
          <input type="hidden" name="date" value={date} />
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={query} className="pl-9" placeholder="Search employee name or code" aria-label="Search attendance employees" />
          </div>
          <Select name="size" defaultValue={String(pageSize)} className="w-20">
            {[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <p className="mt-2 text-[12px] text-muted-foreground">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalEmployees)} of {totalEmployees} employees</p>
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="sticky left-0 z-20 bg-card">Employee</TH>
            <TH className="hidden md:table-cell">Department</TH>
            <TH className="hidden lg:table-cell">Branch</TH>
            <TH className="hidden lg:table-cell">Shift</TH>
            <TH>In</TH>
            <TH>Out</TH>
            <TH>Status</TH>
            <TH className="sticky right-0 z-20 w-28 bg-card" />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const statusNow = row.record?.status ?? (row.leave ? "on_leave" : "no_record");
            return (
              <TR key={row.employeeId}>
                <TD className="sticky left-0 z-10 bg-card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tint-strong text-[11px] font-bold text-muted-foreground">
                      {row.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">{row.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{row.employeeNumber}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">{row.branch} · {row.department}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden md:table-cell">
                  <span className="text-[13px] text-muted-foreground">{row.department}</span>
                </TD>
                <TD className="hidden lg:table-cell">
                  <span className="text-[13px] text-muted-foreground">{row.branch}</span>
                </TD>
                <TD className="hidden lg:table-cell">
                  <span className="text-[13px] text-muted-foreground">{row.shift}</span>
                </TD>
                <TD className="font-mono text-[13px]">{row.record?.punchIn ?? "—"}</TD>
                <TD className="font-mono text-[13px]">{row.record?.punchOut ?? "—"}</TD>
                <TD className="sticky right-0 z-10 bg-card">
                  {!row.record && row.leave ? (
                    <Badge className="border-transparent" style={{ background: `${row.leave.color}22`, color: row.leave.color }}>
                      On leave · {row.leave.type}
                    </Badge>
                  ) : row.record && editing === row.employeeId ? (
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-32 text-xs">
                      {["present", "late", "permission", "absent", "half_day"].map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <StatusPill status={statusNow} />
                      {row.record?.reviewStatus && (
                        <Badge tone="warning">Review</Badge>
                      )}
                    </div>
                  )}
                </TD>
                <TD>
                  {editing === row.employeeId ? (
                    <div className="flex items-center gap-1.5">
                      <Button size="icon" variant="success" loading={saving} aria-label={`Save status for ${row.name}`} onClick={() => save(row.record!.id)}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Cancel editing ${row.name}`} onClick={() => setEditing(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {row.record ? (
                        <>
                          <Button size="icon" variant="ghost" title="View / correct punches" aria-label={`View punches for ${row.name ?? row.employeeId}`} onClick={() => setCorrection(row.record!)}>
                            <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Edit status" aria-label={`Edit status for ${row.name ?? row.employeeId}`} onClick={() => { setEditing(row.employeeId); setStatus(row.record!.status); }}>
                            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={8} className="py-10 text-center text-[13px] text-muted-foreground">No employees match your search.</TD>
            </TR>
          )}
        </TBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-edge px-5 py-3 text-[13px]">
          {page > 1 ? <Link href={pageUrl(page - 1)} className="inline-flex h-8 items-center rounded-lg border border-edge-strong bg-card px-3 text-xs font-medium text-foreground hover:bg-tint">Previous</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={pageUrl(page + 1)} className="inline-flex h-8 items-center rounded-lg border border-edge-strong bg-card px-3 text-xs font-medium text-foreground hover:bg-tint">Next</Link> : <span />}
        </div>
      )}

      {/* Punch correction modal */}
      <Modal
        open={Boolean(correction)}
        onClose={() => setCorrection(null)}
        title="Correct punches"
        description={`${date} · every change re-derives the day from its punches`}
        size="md"
      >
        <div className="space-y-3">
          {!correction?.punches || correction.punches.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No punches recorded for this day.</p>
          ) : (
            correction.punches.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-edge bg-tint px-3.5 py-2.5">
                <span
                  className={
                    p.type === "in"
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400"
                      : p.type === "out"
                        ? "rounded-full bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-sky-400"
                        : "rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                  }
                >
                  {p.type}
                </span>
                <span className="font-mono text-[13px]">{fmtISTFull(p.time)} IST</span>
                <span className="text-[11px] capitalize text-muted-foreground">{p.source}{p.deviceSn ? ` · ${p.deviceSn}` : ""}</span>
                <button
                  onClick={() => setDeleteTarget(p.id)}
                  aria-label={`Delete punch at ${fmtISTFull(p.time)}`}
                  className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  title="Delete punch"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}

          <div className="flex items-center gap-2 pt-2">
            <Input
              type="datetime-local"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="font-mono"
            />
            <Button size="sm" variant="outline" onClick={addPunch}>
              <Plus className="h-3.5 w-3.5" /> Add punch
            </Button>
          </div>

          {correction?.reviewStatus && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-400">
              Flagged: {correction.reviewStatus === "missed_punch" ? "probable missed punch-out — add the missing time" : "implausible span — check the punches"}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete punch?"
        description="This removes the punch and re-derives the day from the remaining punches."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => { if (!deleteBusy) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) deletePunch(deleteTarget); }}
      />
    </>
  );
}
