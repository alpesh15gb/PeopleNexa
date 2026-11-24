"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export type ApprovalAction =
  | { kind: "leave"; id: string; cancellation: boolean; cancellationRequestedAt?: string }
  | { kind: "correction"; id: string };

export function ApprovalDrawer({ title, employee, backHref, resultHref, action, children }: {
  title: string;
  employee: string;
  backHref: string;
  resultHref: string;
  action: ApprovalAction;
  children: ReactNode;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const busy = decision !== null;

  function close() {
    if (!busy) router.replace(backHref, { scroll: false });
  }

  async function decide(status: "approved" | "rejected") {
    if (busy) return;
    setDecision(status);
    setError("");
    const correction = action.kind === "correction";
    const id = encodeURIComponent(action.id);
    try {
      const response = await fetch(correction ? `/api/attendance/corrections/${id}` : `/api/leaves/requests/${id}/review`, {
        method: correction ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(correction ? { status, reviewNote: note } : {
          status: action.cancellation ? `cancellation_${status}` : status,
          note,
          ...(action.cancellationRequestedAt ? { expectedCancellationRequestedAt: action.cancellationRequestedAt } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(typeof result?.error === "string" ? result.error : "Could not save the decision. Try again.");
        return;
      }
      router.replace(resultHref);
      router.refresh();
    } catch {
      setError("Could not confirm the decision. Reload the inbox to check its status before retrying.");
    } finally {
      setDecision(null);
    }
  }

  return <Modal open onClose={close} title={title} description={employee} placement="drawer">
    <div className="space-y-5">
      {children}
      {action.kind === "leave" && action.cancellation && <p className="text-sm text-muted-foreground">Approving restores the leave balance. Declining keeps the approved leave in effect.</p>}
      <Field label="Review note (optional)">
        <Textarea maxLength={2000} rows={3} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-edge pt-4" aria-busy={busy}>
        <Button type="button" variant="outline" loading={decision === "rejected"} disabled={busy} onClick={() => decide("rejected")}>Decline</Button>
        <Button type="button" loading={decision === "approved"} disabled={busy} onClick={() => decide("approved")}>Approve</Button>
      </div>
    </div>
  </Modal>;
}
