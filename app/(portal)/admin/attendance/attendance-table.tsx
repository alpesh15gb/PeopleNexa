"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListChecks, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate, formatWorkspaceTime } from "@/lib/workspace-time";

interface PunchRow {
  id: string;
  time: string;
  source: string;
  type: string;
  deviceSn?: string | null;
}

interface Row {
  employeeId: string;
  canEdit: boolean;
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

export function AttendanceTable({ rows, date, branchId, query, status: statusFilter, page, pageSize, totalEmployees, totalPages, region }: { rows: Row[]; date: string; branchId: string; query: string; status: string; page: number; pageSize: number; totalEmployees: number; totalPages: number; region: WorkspaceRegion }) {
  const router = useRouter();
  const toast = useToast();
  const [statusTarget, setStatusTarget] = useState<Row | null>(null);
  const [statusError, setStatusError] = useState("");
  const [punchError, setPunchError] = useState("");
  const [punchBusy, setPunchBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState<Row | null>(null);
  const [newTime, setNewTime] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function punchDateTime(iso: string) {
    const punch = new Date(iso);
    return `${formatCalendarDate(dateKeyInTimeZone(punch, region.timeZone), region.locale)} ${formatWorkspaceTime(punch, region)}`;
  }

  function openStatus(row: Row) {
    setStatusTarget(row);
    setStatus(row.record?.status ?? "");
    setOverrideReason("");
    setStatusError("");
  }

  async function saveStatus() {
    if (!statusTarget || !status || !overrideReason.trim() || saving) return;
    setSaving(true);
    setStatusError("");
    const record = statusTarget.record;
    try {
      const res = await fetch(record ? `/api/attendance/${record.id}` : "/api/attendance", {
        method: record ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: statusTarget.employeeId, date, status, note: overrideReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatusError(data.error ?? "The attendance status could not be saved."); return; }
      toast("success", record ? "Attendance status updated." : "Attendance status recorded.");
      setStatusTarget(null);
      router.refresh();
    } catch {
      setStatusError("The save could not be confirmed. Check daily attendance before trying again.");
    } finally {
      setSaving(false);
    }
  }

  function openPunches(row: Row) {
    setCorrection(row);
    setNewTime("");
    setPunchError("");
  }

  function applyPunchResult(record: { punches: PunchRow[] | null; reviewStatus: string | null } | null) {
    setCorrection((row) => row?.record && record ? { ...row, record: { ...row.record, ...record } } : null);
    router.refresh();
  }

  async function addPunch() {
    if (!correction?.record || !correction.canEdit || !newTime || punchBusy) return;
    setPunchBusy(true);
    setPunchError("");
    try {
      const res = await fetch(`/api/attendance/${correction.record.id}/punches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time: newTime }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setPunchError(data.error ?? "The punch could not be added."); return; }
      toast("success", "Punch added and attendance updated.");
      setNewTime("");
      applyPunchResult(data.record);
    } catch {
      setPunchError("The save could not be confirmed. Check the punch list before trying again.");
    } finally {
      setPunchBusy(false);
    }
  }

  async function deletePunch(punchId: string) {
    if (!correction?.record || !correction.canEdit || deleteBusy) return;
    setDeleteBusy(true);
    setPunchError("");
    try {
      const res = await fetch(`/api/attendance/${correction.record.id}/punches?punchId=${punchId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setPunchError(data.error ?? "The punch could not be deleted."); return; }
      toast("success", "Punch removed and attendance updated.");
      applyPunchResult(data.record);
    } catch {
      setPunchError("The save could not be confirmed. Check the punch list before trying again.");
    } finally {
      setDeleteTarget(null);
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
                      <p className="mt-0.5 text-[11px] text-muted-foreground lg:hidden">Shift: {row.shift}</p>
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
                  <div className="flex items-center gap-1">
                    {row.record && <Button size="icon" variant="ghost" title="View punches" aria-label={`View punches for ${row.name}`} onClick={() => openPunches(row)}>
                      <ListChecks aria-hidden="true" className="h-4 w-4" />
                    </Button>}
                    {row.canEdit && <Button size="icon" variant="ghost" title={row.record ? "Edit status" : "Record status"} aria-label={`${row.record ? "Edit" : "Record"} status for ${row.name}`} onClick={() => openStatus(row)}>
                      {row.record ? <Pencil aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    </Button>}
                  </div>
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

      <Modal open={Boolean(statusTarget)} onClose={() => !saving && setStatusTarget(null)} title={statusTarget?.record ? "Edit attendance status" : "Record attendance status"} description={statusTarget ? `${statusTarget.name} · ${formatCalendarDate(date, region.locale)}` : undefined}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveStatus(); }}>
          {statusError && <p role="alert" className="text-sm text-destructive">{statusError}</p>}
          <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)} required>
            <option value="">Choose a status</option><option value="present">Present</option><option value="late">Late</option><option value="permission">Permission</option><option value="absent">Absent</option><option value="half_day">Half day</option>
          </Select></Field>
          <Field label="Reason"><Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} maxLength={2000} required /></Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!status || !overrideReason.trim()}>Save status</Button>
          </div>
        </form>
      </Modal>

      {/* Punch correction modal */}
      <Modal
        open={Boolean(correction)}
        onClose={() => !punchBusy && !deleteBusy && setCorrection(null)}
        title={correction?.canEdit ? "Review and edit punches" : "Recorded punches"}
        description={correction ? `${correction.name} · ${formatCalendarDate(date, region.locale)} · ${region.timeZone}` : undefined}
        size="md"
      >
        <div className="space-y-3">
          {!correction?.record?.punches || correction.record.punches.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No punches recorded for this day.</p>
          ) : (
            correction.record.punches.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-tint px-3.5 py-2.5">
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
                <span className="font-mono text-[13px]">{punchDateTime(p.time)}</span>
                <span className="text-[11px] capitalize text-muted-foreground">{p.source}{p.deviceSn ? ` · ${p.deviceSn}` : ""}</span>
                {correction.canEdit && <button
                  onClick={() => setDeleteTarget(p.id)}
                  aria-label={`Delete punch at ${punchDateTime(p.time)}`}
                  className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  title="Delete punch"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>}
              </div>
            ))
          )}

          {punchError && <p role="alert" className="text-sm text-destructive">{punchError}</p>}
          {correction?.canEdit && <div className="flex flex-wrap items-end gap-2 pt-2">
            <Field label="Local punch date and time"><Input
              type="datetime-local"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="font-mono"
            /></Field>
            <Button size="sm" variant="outline" loading={punchBusy} disabled={!newTime || deleteBusy} onClick={addPunch}>
              <Plus className="h-3.5 w-3.5" /> Add punch
            </Button>
          </div>}

          {correction?.record?.reviewStatus && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-400">
              Flagged: {correction.record.reviewStatus === "missed_punch" ? "probable missed punch-out — add the missing time" : "implausible span — check the punches"}
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
