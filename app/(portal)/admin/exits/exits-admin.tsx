"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban, CircleCheck, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { istDateKey } from "@/lib/ist";
import { formatRegionalMoney, type WorkspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone, formatCalendarDate } from "@/lib/workspace-time";
import { Select } from "@/components/ui/select";
import Link from "next/link";

interface ExitRequest {
  id: string;
  reason: string;
  resignationDate: Date;
  lastWorkingDay: Date;
  status: string;
  note: string | null;
  fAndF: {
    grossMonthly: number;
    perDay: number;
    earnedDays: number;
    earnedSalary: number;
    noticeDaysGiven: number;
    noticeShortfallDays: number;
    noticeDeduction: number;
    loanOutstanding: number;
    finalAmount: number;
  } | null;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string; department: { name: string } | null };
}

export function ExitsAdmin({ requests, actorId, region, reviewOnly = false }: { requests: ExitRequest[]; actorId: string; region: WorkspaceRegion; reviewOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ExitRequest | null>(null);
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<{ request: ExitRequest; action: "complete" | "cancel" } | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [reviewError, setReviewError] = useState("");

  const pending = requests.filter((r) => r.status === "pending").length;
  const active = requests.filter((r) => r.status === "approved").length;
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const calendarDate = (date: Date) => formatCalendarDate(istDateKey(date), region.locale);
  const matches = requests.filter((request) => (status === "all" || request.status === status) &&
    `${request.employee.firstName} ${request.employee.lastName} ${request.employee.employeeNumber}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function act(r: ExitRequest, action: "approve" | "reject" | "complete" | "cancel") {
    if (busy) return;
    setReviewError("");
    setBusy(r.id);
    try {
      const res = await fetch(`/api/exits/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: action === "reject" || action === "approve" ? note : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (reviewing) setReviewError(data.error ?? "Could not update the request.");
        else toast("error", data.error ?? "Could not update the request.");
        return;
      }
      toast("success", action === "approve" ? "Exit approved and settlement prepared." : action === "complete" ? "Employee offboarded." : action === "reject" ? "Exit rejected." : "Exit cancelled.");
      if (data.deviceWarning) toast("error", data.deviceWarning);
      setReviewing(null);
      setConfirmation(null);
      setNote("");
      router.refresh();
    } catch {
      if (reviewing) setReviewError("Could not save the decision. Try again.");
      else toast("error", "Could not update the request. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 border-b border-edge px-5 py-4">
        <div className="rounded-xl bg-amber-500/10 px-4 py-2.5">
          <p className="font-display text-xl font-bold text-amber-300">{pending}</p>
          <p className="text-[11px] text-muted-foreground">Pending</p>
        </div>
        {!reviewOnly && <div className="rounded-xl bg-sky-500/10 px-4 py-2.5">
          <p className="font-display text-xl font-bold text-sky-300">{active}</p>
          <p className="text-[11px] text-muted-foreground">Approved exits</p>
        </div>}
        <p className="ml-auto text-[12px] text-muted-foreground">
          Approval prepares the settlement. Complete the exit on or after the last working day.
        </p>
      </div>
      {requests.length > 0 && <div className="flex flex-wrap gap-3 border-b border-edge px-5 py-3">
        <Input aria-label="Search exit requests" placeholder="Employee name or code" className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} />
        {!reviewOnly && <Select aria-label="Exit status" value={status} className="w-auto" onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></Select>}
      </div>}

      <Table>
        <THead>
          <TR>
            <TH>Employee</TH>
            <TH>Reason</TH>
            <TH>Resigned</TH>
            <TH>Last working day</TH>
            <TH>Status</TH>
            <TH className="text-right">F&F</TH>
            <TH className="w-32" />
          </TR>
        </THead>
        <TBody>
          {matches.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center text-[13px] text-muted-foreground">
                {requests.length ? "No requests match your filters." : reviewOnly ? "No exit requests need your review." : "Employee exit requests will appear here."}
              </td>
            </tr>
          ) : (
            matches.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/admin/employee-master?employee=${encodeURIComponent(r.employee.id)}#employee-record`} className="text-sm font-medium hover:text-primary hover:underline">{r.employee.firstName} {r.employee.lastName}</Link>
                  <p className="text-[11.5px] text-muted-foreground">
                    {r.employee.employeeNumber}{r.employee.department ? ` · ${r.employee.department.name}` : ""}
                  </p>
                </TD>
                <TD className="max-w-[220px]">
                  <details><summary className="cursor-pointer text-sm text-primary">View reason{r.note ? " and note" : ""}</summary><p className="mt-2 break-words text-sm text-muted-foreground">{r.reason}</p>{r.note && <p className="mt-2 break-words text-xs text-muted-foreground">HR note · {r.note}</p>}</details>
                </TD>
                <TD className="font-mono text-[12.5px]">{calendarDate(r.resignationDate)}</TD>
                <TD className="font-mono text-[12.5px]">{calendarDate(r.lastWorkingDay)}</TD>
                <TD><StatusPill status={r.status} /></TD>
                <TD className="text-right">
                  {r.fAndF ? (
                    <div>
                      <p className="font-mono text-[13px] font-bold text-emerald-300">{formatRegionalMoney(r.fAndF.finalAmount, region)}</p>
                      <p className="text-[10.5px] text-muted-foreground">{r.fAndF.earnedDays}d earned · {r.fAndF.noticeShortfallDays}d shortfall</p>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">—</span>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    {r.status === "pending" && (r.employee.id !== actorId ? <Button size="sm" variant="outline" onClick={() => { setNote(""); setReviewError(""); setReviewing(r); }}>Review request</Button> : <span className="text-xs text-muted-foreground">Another reviewer required</span>)}
                    {r.status === "approved" && r.employee.id !== actorId && (
                      today < istDateKey(r.lastWorkingDay) ? <span className="text-xs text-muted-foreground">Complete from {calendarDate(r.lastWorkingDay)}</span> : <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setConfirmation({ request: r, action: "complete" })}>
                        <Handshake aria-hidden="true" className="h-3.5 w-3.5" /> Complete
                      </Button>
                    )}
                    {(r.status === "pending" || (r.status === "approved" && r.employee.id !== actorId)) && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy === r.id} onClick={() => setConfirmation({ request: r, action: "cancel" })} aria-label="Cancel exit request">
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <Modal open={reviewing !== null} onClose={() => !busy && setReviewing(null)} title="Review exit request" size="sm">
        <div className="space-y-4">
          {reviewing && <div className="rounded-xl bg-tint p-3">
            <p className="text-sm font-semibold">{reviewing.employee.firstName} {reviewing.employee.lastName}</p>
            <p className="mt-1 text-sm text-muted-foreground">Last working day · {calendarDate(reviewing.lastWorkingDay)}</p>
            <p className="mt-2 break-words text-sm">{reviewing.reason}</p>
          </div>}
          <Field label="Note to employee (optional)">
            <Input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {reviewError && <p role="alert" className="text-sm text-destructive">{reviewError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setReviewing(null)}>Close</Button>
            <Button type="button" variant="danger" loading={busy === reviewing?.id} onClick={() => reviewing && act(reviewing, "reject")}>
              <CircleCheck className="h-3.5 w-3.5" /> Reject exit
            </Button>
            <Button type="button" variant="success" disabled={!!busy} onClick={() => reviewing && act(reviewing, "approve")}><Check aria-hidden="true" className="h-3.5 w-3.5" /> Approve exit</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.action === "complete" ? "Complete employee exit?" : "Cancel exit request?"}
        description={confirmation?.action === "complete" ? "This deactivates the employee’s account and sends device block commands. Confirm that assigned assets have been collected." : "The request will be marked cancelled and retained in exit history."}
        confirmLabel={confirmation?.action === "complete" ? "Complete exit" : "Cancel exit request"}
        busy={busy === confirmation?.request.id}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => confirmation && act(confirmation.request, confirmation.action)}
      />
    </div>
  );
}
