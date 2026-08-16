"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban, CircleCheck, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

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
  employee: { firstName: string; lastName: string; employeeNumber: string; salary: number | null; department: { name: string } | null };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function ExitsAdmin({ requests }: { requests: ExitRequest[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ExitRequest | null>(null);
  const [note, setNote] = useState("");

  const pending = requests.filter((r) => r.status === "pending").length;
  const active = requests.filter((r) => r.status === "approved").length;

  async function act(r: ExitRequest, action: string) {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/exits/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed");
        return;
      }
      toast("success", action === "approve" ? "Exit approved — F&F computed" : action === "complete" ? "Employee offboarded" : "Updated");
      setReviewing(null);
      setNote("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirm(r: ExitRequest, action: "approve" | "reject") {
    if (action === "reject") {
      setReviewing(r);
      return;
    }
    setBusy(r.id);
    try {
      const res = await fetch(`/api/exits/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to approve");
        return;
      }
      toast("success", "Exit approved — full & final computed");
      router.refresh();
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
        <div className="rounded-xl bg-sky-500/10 px-4 py-2.5">
          <p className="font-display text-xl font-bold text-sky-300">{active}</p>
          <p className="text-[11px] text-muted-foreground">In notice period</p>
        </div>
        <p className="ml-auto text-[12px] text-muted-foreground">
          Approving computes the full & final settlement; completing marks the employee inactive.
        </p>
      </div>

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
          {requests.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center text-[13px] text-muted-foreground">
                No exit requests yet.
              </td>
            </tr>
          ) : (
            requests.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="text-[13.5px] font-medium">{r.employee.firstName} {r.employee.lastName}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {r.employee.employeeNumber}{r.employee.department ? ` · ${r.employee.department.name}` : ""}
                  </p>
                </TD>
                <TD className="max-w-[220px]">
                  <span className="block truncate text-[13px] text-muted-foreground" title={r.reason}>{r.reason}</span>
                </TD>
                <TD className="font-mono text-[12.5px]">{formatDate(r.resignationDate)}</TD>
                <TD className="font-mono text-[12.5px]">{formatDate(r.lastWorkingDay)}</TD>
                <TD><StatusPill status={r.status} /></TD>
                <TD className="text-right">
                  {r.fAndF ? (
                    <div>
                      <p className="font-mono text-[13px] font-bold text-emerald-300">{inr(r.fAndF.finalAmount)}</p>
                      <p className="text-[10.5px] text-muted-foreground">{r.fAndF.earnedDays}d earned · {r.fAndF.noticeShortfallDays}d shortfall</p>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">—</span>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" variant="success" loading={busy === r.id} onClick={() => confirm(r, "approve")}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => confirm(r, "reject")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => act(r, "complete")}>
                        <Handshake className="h-3.5 w-3.5" /> Complete
                      </Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act(r, "cancel")} title="Cancel request">
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

      <Modal open={reviewing !== null} onClose={() => setReviewing(null)} title={`Reject exit — ${reviewing?.employee.firstName ?? ""}`} size="sm">
        <div className="space-y-4">
          <Field label="Note to employee (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please discuss with HR first" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button type="button" variant="danger" loading={busy === reviewing?.id} onClick={() => reviewing && act(reviewing, "reject")}>
              <CircleCheck className="h-3.5 w-3.5" /> Reject exit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
