"use client";

import { useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

type EmployeeForm = { firstName: string; lastName: string; email: string; phone: string | null; position: string | null; joiningDate: string };

function EmployeeFields({ employee, includeCodes = false }: { employee: EmployeeForm; includeCodes?: boolean }) {
  return <><Field label="First name"><Input name="firstName" required defaultValue={employee.firstName} /></Field><Field label="Last name"><Input name="lastName" defaultValue={employee.lastName} /></Field>{includeCodes && <Field label="Employee code"><Input name="employeeNumber" required /></Field>}{includeCodes && <Field label="Device code"><Input name="deviceCode" placeholder="Biometric enrollment ID" /></Field>}<Field label="Email"><Input name="email" type="email" required defaultValue={employee.email} /></Field><Field label="Phone"><Input name="phone" defaultValue={employee.phone ?? ""} /></Field><Field label="Position"><Input name="position" defaultValue={employee.position ?? ""} /></Field><Field label="Joining date"><Input name="joiningDate" type="date" defaultValue={employee.joiningDate} /></Field></>;
}

export function EmployeeMasterQuickEdit({ employee, canEditEmail }: { employee: EmployeeForm & { id: string }; canEditEmail: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const payload: Record<string, unknown> = { firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone"), position: form.get("position"), joiningDate: form.get("joiningDate") || null };
      if (canEditEmail) payload.email = form.get("email");
      const response = await fetch(`/api/employees/${employee.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update employee.");
      toast("success", "Employee updated");
      setOpen(false);
      router.refresh();
    } catch (error) { toast("error", error instanceof Error ? error.message : "Could not update employee."); }
    finally { setSaving(false); }
  }
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit employee</Button><Modal open={open} onClose={() => setOpen(false)} title="Edit employee"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><EmployeeFields employee={employee} /><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div></form></Modal></>;
}

export function EmployeeMasterCreate({ branches, requireBranch }: { branches: Array<{ id: string; name: string }>; requireBranch: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNumber: form.get("employeeNumber"), deviceCode: form.get("deviceCode"), firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"), position: form.get("position"), joiningDate: form.get("joiningDate") || null, branchId: form.get("branchId") || null, password: crypto.randomUUID() + "Aa1!" }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Could not add employee.");
      toast("success", "Employee added. Complete the master profile next."); setOpen(false); router.push(`/admin/employee-master?employee=${data.employee.id}`); router.refresh();
    } catch (error) { toast("error", error instanceof Error ? error.message : "Could not add employee."); } finally { setSaving(false); }
  }
  return <><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button><Modal open={open} onClose={() => setOpen(false)} title="Add employee" description="Create the core employee record, then complete their master profile."><form onSubmit={create} className="grid gap-4 sm:grid-cols-2"><EmployeeFields employee={{ firstName: "", lastName: "", email: "", phone: "", position: "", joiningDate: "" }} includeCodes /><Field label="Branch"><select name="branchId" required={requireBranch} className="h-10 w-full rounded-xl border border-input bg-card-2 px-3 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40"><option value="">{requireBranch ? "Select a branch" : "Unassigned"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Add employee</Button></div></form></Modal></>;
}
