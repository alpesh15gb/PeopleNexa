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
  correctionHref: string | null;
  canEdit: boolean;
  punchReceived: boolean;
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

  const filterReset = `/admin/attendance?${new URLSearchParams({ date, ...(branchId && { branch: branchId }), size: String(pageSize) })}`;
  const statusLabel = statusFilter === "present" ? "With punches" : statusFilter === "late" ? "Late" : statusFilter === "needs_review" ? "Needs review" : "";
  const reviewLabels: Record<string, string> = { missed_punch: "Missing punch", needs_review: "Check punch times" };

  function rowStatus(row: Row) {
    const review = reviewLabels[row.record?.reviewStatus ?? ""];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {row.record ? <StatusPill status={row.record.status} /> :
          row.leave ? <Badge tone="info">On leave</Badge> :
          row.punchReceived ? <Badge tone="info">Punch received</Badge> : <StatusPill status="no_record" />}
        {review && <Badge tone="warning">{review}</Badge>}
      </div>
    );
  }

  function rowActions(row: Row, mobile = false) {
    const labels = row.record ? ["View punches", "Edit status"] : ["View punches", "Record status"];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {row.correctionHref && <Link href={row.correctionHref} prefetch={false} scroll={false} aria-label={`Review correction for ${row.name}`} className="inline-flex min-h-9 items-center rounded-lg border border-edge px-2.5 text-xs font-semibold text-primary hover:bg-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Review correction</Link>}
        {row.record && <Button size={mobile ? "sm" : "icon"} variant={mobile ? "outline" : "ghost"} title={labels[0]} aria-label={`${labels[0]} for ${row.name}`} onClick={() => openPunches(row)}>
          <ListChecks aria-hidden="true" className="h-4 w-4" />{mobile && labels[0]}
        </Button>}
        {row.canEdit && <Button size={mobile ? "sm" : "icon"} variant={mobile ? "outline" : "ghost"} title={labels[1]} aria-label={`${labels[1]} for ${row.name}`} onClick={() => openStatus(row)}>
          {row.record ? <Pencil aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}{mobile && labels[1]}
        </Button>}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 border-b border-edge px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-semibold">Employee records</h2>
            <p className="text-sm text-muted-foreground">{totalEmployees === 0 ? "0 employees" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalEmployees)} of ${totalEmployees} employees`}</p>
          </div>
          {(query || statusLabel) && <Link href={filterReset} className="inline-flex min-h-9 items-center text-sm font-medium text-primary hover:underline">Clear filters</Link>}
        </div>
        <form action="/admin/attendance" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="date" value={date} />
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <div className="relative min-w-40 flex-1 sm:max-w-xs">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" type="search" key={query} defaultValue={query} maxLength={100} className="pl-9" placeholder="Search by name or code" aria-label="Search attendance employees" />
          </div>
          <Select name="size" aria-label="Rows per page" key={pageSize} defaultValue={String(pageSize)} className="w-20">
            {[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        {statusLabel && <Badge tone="info">{statusLabel}</Badge>}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="font-medium">{query || statusFilter ? "No employees match the current filters" : "No employees in this scope"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{query || statusFilter ? "Change the search or clear the filters to see more results." : "Choose another branch or check your employee assignments."}</p>
        </div>
      ) : (
        <>
          <ul aria-label="Employee attendance records" className="divide-y divide-edge md:hidden">
            {rows.map((row) => <li key={row.employeeId} className="space-y-3 p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="break-words font-semibold">{row.name}</h3><p className="break-words text-xs text-muted-foreground">{row.employeeNumber} · {row.branch}</p></div>
                {rowStatus(row)}
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-tint/50 p-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Clock-in</dt><dd className="font-medium tabular-nums">{row.record?.punchIn ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Clock-out</dt><dd className="font-medium tabular-nums">{row.record?.punchOut ?? "—"}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">Shift</dt><dd className="break-words font-medium">{row.shift}</dd></div>
              </dl>
              {row.leave && <p className="text-xs text-muted-foreground">{row.leave.type}</p>}
              {rowActions(row, true)}
            </li>)}
          </ul>
          <div className="hidden md:block">
            <Table>
              <caption className="sr-only">Employee attendance records</caption>
              <THead>
                <TR><TH>Employee</TH><TH>Status</TH><TH>Clock-in</TH><TH>Clock-out</TH><TH>Shift</TH><TH className="text-right">Actions</TH></TR>
              </THead>
              <TBody>
                {rows.map((row) => <TR key={row.employeeId}>
                  <TD>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.employeeNumber} · {row.branch} · {row.department}</p>
                  </TD>
                  <TD>{rowStatus(row)}{row.leave && <p className="mt-1 text-xs text-muted-foreground">{row.leave.type}</p>}</TD>
                  <TD className="tabular-nums">{row.record?.punchIn ?? "—"}{row.record && row.record.lateMinutes > 0 && <p className="text-xs text-muted-foreground">{row.record.lateMinutes} min late</p>}</TD>
                  <TD className="tabular-nums">{row.record?.punchOut ?? "—"}</TD>
                  <TD className="text-sm text-muted-foreground">{row.shift}</TD>
                  <TD><div className="flex justify-end">{rowActions(row)}</div></TD>
                </TR>)}
              </TBody>
            </Table>
          </div>
        </>
      )}
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
