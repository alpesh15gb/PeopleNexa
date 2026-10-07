"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
type Preview = { count: number; employees: { id: string; employeeNumber: string; firstName: string; lastName: string; shiftId: string | null }[] };
export function BulkShiftPanel({ branches, shifts }: { branches: { id: string; name: string }[]; shifts: { id: string; name: string; startTime: string; endTime: string }[] }) {
  const router = useRouter();
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function invalidate() { setPreview(null); setMessage(""); }
  async function submit(apply: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/branches/bulk-shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchIds, shiftId, overwrite, apply, expectedEmployees: preview?.employees.map(e => ({ id: e.id, shiftId: e.shiftId })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Assignment failed.");
      if (apply) { setPreview(null); setMessage(`Assigned shift to ${data.count} employees.`); router.refresh(); } else setPreview(data);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Assignment failed."); }
    finally { setBusy(false); }
  }
  return <Card><CardContent className="space-y-4">
    <h2 className="text-lg font-semibold">Bulk assign employee shifts by branch</h2>
    <p className="text-sm text-muted-foreground">Assign a fixed shift to active employees in selected branches. By default, only employees without a shift are included. New hires are not assigned automatically. Date-specific rosters take precedence.</p>
    <fieldset disabled={busy} className="space-y-3"><legend className="font-medium">Select branches</legend>
      <div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto md:grid-cols-3">{branches.map(branch => <label key={branch.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={event => { invalidate(); setBranchIds(ids => event.target.checked ? [...ids, branch.id] : ids.filter(id => id !== branch.id)); }} />{branch.name}</label>)}</div>
      <label className="block text-sm">Shift<select className="mt-1 block w-full rounded border border-input bg-card p-2" value={shiftId} onChange={event => { invalidate(); setShiftId(event.target.value); }}><option value="">Select shift</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overwrite} onChange={event => { invalidate(); setOverwrite(event.target.checked); }} />Replace existing employee shifts</label>
    </fieldset>
    <p className="text-sm text-muted-foreground">Finalized attendance and existing payslips are not recalculated. Historical reports that fall back to the employee’s current shift may reflect this assignment.</p>
    <Button disabled={busy || !branchIds.length || !shiftId} onClick={() => submit(false)}>Preview employees</Button>
    {preview && <div className="space-y-3"><p>{preview.count} employees will receive this shift.</p><div className="max-h-48 overflow-auto text-sm">{preview.employees.map(employee => <p key={employee.id}>{employee.employeeNumber} — {employee.firstName} {employee.lastName}</p>)}</div><Button disabled={busy || !preview.count} onClick={() => submit(true)}>Assign shift to {preview.count} employees</Button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </CardContent></Card>;
}
