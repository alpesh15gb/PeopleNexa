"use client";

import Link from "next/link";
import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { runEmployeeStatusBatch, type EmployeeStatus, type StatusBatchResult } from "@/lib/employee-status-batch";
import { EmployeeStatusAction } from "./employee-status-action";

type Employee = { id: string; employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; status: string; role: string; branch: { name: string } | null; assignmentPending?: boolean };

export function EmployeeMasterList({ employees, selectedId, query, status, page, pageCount, counts, canChangeStatus, actorId }: {
  employees: Employee[]; selectedId?: string; query: string; status: "all" | EmployeeStatus | "assignment_pending";
  page: number; pageCount: number; counts: { all: number; active: number; inactive: number; assignment_pending: number }; canChangeStatus: boolean; actorId: string;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = event.currentTarget.getAttribute("href");
    if (url) startNavigation(() => router.push(url, { scroll: false }));
  }
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [target, setTarget] = useState<EmployeeStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<StatusBatchResult[] | null>(null);
  const eligible = employees.filter((employee) => employee.id !== actorId && !["admin", "branch_manager", "location_manager"].includes(employee.role));
  const selected = employees.filter((employee) => selection.includes(employee.id));
  function href(nextPage: number, nextStatus = status, employee?: string) {
    return `/admin/employee-master?${new URLSearchParams({ ...(query ? { q: query } : {}), status: nextStatus, page: String(nextPage), ...(employee ? { employee } : {}) })}`;
  }
  function close() {
    if (busy) return;
    setTarget(null);
    if (results) { setSelection([]); setSelecting(false); setResults(null); router.refresh(); }
  }
  async function submit(ids = selection) {
    if (!target || busy) return;
    setBusy(true); setResults([]);
    try {
      await runEmployeeStatusBatch(ids, target, reason, (result) => setResults((current) => [...(current ?? []), result]));
    } finally { setBusy(false); }
  }
  const retryIds = results?.filter((result) => result.outcome === "failed").map((result) => result.id) ?? [];
  const resultCount = (outcome: StatusBatchResult["outcome"]) => results?.filter((result) => result.outcome === outcome).length ?? 0;

  return <div aria-busy={navigating}>
    {navigating && <p role="status" className="mb-2 text-xs text-muted-foreground">Loading employees…</p>}
    <div className="flex items-center justify-between gap-2">
      <nav aria-label="Employee status filter" className="flex flex-wrap gap-1">
        {(["all", "active", "inactive"] as const).map((value) => <Link prefetch={false} scroll={false} onClick={navigate} key={value} href={href(1, value)} aria-current={status === value ? "page" : undefined} className={`rounded-md px-2 py-1.5 text-xs font-medium ${status === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-tint"}`}>{value === "all" ? "All" : value === "active" ? "Active" : "Inactive"} ({counts[value]})</Link>)}
      </nav>
      <Link prefetch={false} scroll={false} onClick={navigate} href={href(1, "assignment_pending")} aria-current={status === "assignment_pending" ? "page" : undefined} className={`rounded-md px-2 py-1.5 text-xs ${status === "assignment_pending" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>Assignment Pending ({counts.assignment_pending})</Link>
      {canChangeStatus && !selecting && <Button size="sm" variant="ghost" disabled={!eligible.length} onClick={() => setSelecting(true)}>Select</Button>}
    </div>
    {selecting && <div className="space-y-2 rounded-lg border border-edge bg-muted/30 p-2">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label="Select eligible employees on this page" checked={eligible.length > 0 && eligible.every((employee) => selection.includes(employee.id))} disabled={!eligible.length || busy} onChange={(event) => setSelection(event.target.checked ? eligible.map((employee) => employee.id) : [])} /> Select this page</label>
      <p className="text-xs text-muted-foreground">{selection.length} selected · current page only. Your account and privileged accounts are excluded.</p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" disabled={!selection.length || busy} onClick={() => { setReason(""); setResults(null); setTarget("active"); }}>Mark active</Button>
        <Button size="sm" variant="outline" disabled={!selection.length || busy} onClick={() => { setReason(""); setResults(null); setTarget("inactive"); }}>Mark inactive</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSelecting(false); setSelection([]); }}>Cancel</Button>
      </div>
    </div>}
    <div className="max-h-[60vh] divide-y divide-edge overflow-y-auto rounded-xl border border-edge">
      {employees.map((item) => <div key={item.id} className={`flex items-center gap-1 px-3 py-3 transition-colors hover:bg-tint ${item.id === selectedId ? "bg-primary/[0.08]" : ""}`}>
        {selecting && <input type="checkbox" className="mr-2" aria-label={`Select ${item.firstName} ${item.lastName} (${item.employeeNumber})`} disabled={busy || !eligible.some((employee) => employee.id === item.id)} checked={selection.includes(item.id)} onChange={(event) => setSelection((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />}
        <Link prefetch={false} scroll={false} onClick={navigate} href={href(page, status, item.id)} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.firstName} {item.lastName}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{item.employeeNumber} · {item.deviceCode ?? "No device ID"}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.assignmentPending ? "Assignment Pending" : item.branch?.name ?? "Unassigned"} · {item.position ?? "No designation"}</p>
          <div className="mt-1"><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "Active" : "Inactive"}</Badge></div>
        </Link>
        {canChangeStatus && !selecting && <EmployeeStatusAction compact employeeId={item.id} employeeName={`${item.firstName} ${item.lastName}`} status={item.status} />}
      </div>)}
      {!employees.length && <p className="p-5 text-center text-sm text-muted-foreground">No employees found.</p>}
    </div>
    {pageCount > 1 && <div className="flex items-center justify-between text-xs"><Link prefetch={false} scroll={false} onClick={navigate} href={href(Math.max(1, page - 1))} aria-disabled={page === 1} className={page === 1 ? "pointer-events-none text-muted-foreground/50" : "font-medium text-primary"}>Previous</Link><span className="text-muted-foreground">Page {page} of {pageCount}</span><Link prefetch={false} scroll={false} onClick={navigate} href={href(Math.min(pageCount, page + 1))} aria-disabled={page === pageCount} className={page === pageCount ? "pointer-events-none text-muted-foreground/50" : "font-medium text-primary"}>Next</Link></div>}
    <Modal open={target !== null} onClose={close} title={`Mark ${selected.length} employee${selected.length === 1 ? "" : "s"} ${target ?? ""}?`} description="Only the selected employees on this page are included.">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{target === "inactive" ? "Employment status changes immediately and biometric access is blocked. Attendance, payroll history and employee records are retained. This does not start offboarding." : "Employment status is restored. Device access stays blocked until explicitly restored under Device access."}</p>
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-edge p-3">
          {selected.map((employee) => { const result = results?.find((entry) => entry.id === employee.id); return <div key={employee.id} className="text-sm"><p className="font-medium">{employee.firstName} {employee.lastName}</p><p className="text-xs text-muted-foreground">{employee.employeeNumber} · {employee.deviceCode ?? "No device ID"} · {employee.status}</p>{result && <p className={`text-xs ${result.outcome === "failed" || result.outcome === "uncertain" ? "text-danger" : "text-muted-foreground"}`}>{result.message}</p>}</div>; })}
        </div>
        {results === null ? <><p className="text-xs text-muted-foreground">{selected.filter((employee) => employee.status !== target).length} need a status change; {selected.filter((employee) => employee.status === target).length} already {target}.</p><Field label="Reason (optional)"><Input maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field></> : <div role="status" aria-live="polite" className="space-y-1 text-sm"><p>{resultCount("updated")} updated · {resultCount("unchanged")} unchanged · {resultCount("failed")} failed · {resultCount("uncertain")} unconfirmed</p>{busy ? <p>Processed {results.length} of {selection.length}. Keep this window open.</p> : <>{results.length < selection.length && <p>{selection.length - results.length} employees were not submitted.</p>}{resultCount("uncertain") > 0 && <p>Close and check the unconfirmed employee before retrying.</p>}</>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={close}>{results ? "Close and refresh" : "Cancel"}</Button>{results === null ? <Button variant={target === "inactive" ? "danger" : "primary"} loading={busy} onClick={() => void submit()}>Confirm {target}</Button> : retryIds.length > 0 && !resultCount("uncertain") ? <Button disabled={busy} onClick={() => { setSelection(retryIds); void submit(retryIds); }}>Retry failed ({retryIds.length})</Button> : null}</div>
      </div>
    </Modal>
  </div>;
}
