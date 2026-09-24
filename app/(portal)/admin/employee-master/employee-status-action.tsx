"use client";

import { useState } from "react";
import { CircleCheck, CircleOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function EmployeeStatusAction({ employeeId, employeeName, status, compact = false }: { employeeId: string; employeeName: string; status: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const nextStatus = status === "active" ? "inactive" : "active";
  const deactivate = nextStatus === "inactive";

  async function submit() {
    setSaving(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus, reason }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) throw new Error(data.error ?? "Could not update employee status.");
      const failures = data.deviceFailures?.length ?? 0;
      toast(failures ? "error" : "success", failures ? `Employment status updated, but ${failures} eBio block command(s) failed. Review device access.` : `Employee marked ${nextStatus}.`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not update employee status.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Button size={compact ? "icon" : "sm"} variant={deactivate ? "outline" : "outline"} className={deactivate ? "text-amber-300 hover:bg-amber-500/10" : "text-emerald-300 hover:bg-emerald-500/10"} aria-label={`${deactivate ? "Mark inactive" : "Mark active"}: ${employeeName}`} title={`${deactivate ? "Mark inactive" : "Mark active"}: ${employeeName}`} onClick={() => setOpen(true)}>
      {deactivate ? <CircleOff className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />} {!compact && (deactivate ? "Mark inactive" : "Mark active")}
    </Button>
    <Modal open={open} onClose={() => !saving && setOpen(false)} title={`${deactivate ? "Mark inactive" : "Mark active"}?`} description={`${employeeName}'s employment status will change immediately.`} size="sm">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">{deactivate ? "Inactive employees are blocked on all active eBio devices. This is not an exit and does not start final settlement or offboarding." : "This restores employment status only. Biometric devices remain blocked until access is explicitly changed under Device access."}</p>
        <Field label="Reason (optional)" hint="This is recorded in the employee status audit."><Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button variant={deactivate ? "danger" : "primary"} loading={saving} onClick={() => void submit()}>{deactivate ? "Mark inactive" : "Mark active"}</Button></div>
      </div>
    </Modal>
  </>;
}
