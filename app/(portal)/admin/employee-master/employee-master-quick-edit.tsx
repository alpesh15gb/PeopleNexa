"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

export function EmployeeMasterQuickEdit({ employee }: { employee: { id: string; firstName: string; lastName: string; email: string; phone: string | null; position: string | null; joiningDate: string } }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"), position: form.get("position"), joiningDate: form.get("joiningDate") || null }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update employee.");
      toast("success", "Employee updated");
      setOpen(false);
      router.refresh();
    } catch (error) { toast("error", error instanceof Error ? error.message : "Could not update employee."); }
    finally { setSaving(false); }
  }
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit employee</Button><Modal open={open} onClose={() => setOpen(false)} title="Edit employee"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><Field label="First name"><Input name="firstName" required defaultValue={employee.firstName} /></Field><Field label="Last name"><Input name="lastName" defaultValue={employee.lastName} /></Field><Field label="Email"><Input name="email" type="email" required defaultValue={employee.email} /></Field><Field label="Phone"><Input name="phone" defaultValue={employee.phone ?? ""} /></Field><Field label="Position"><Input name="position" defaultValue={employee.position ?? ""} /></Field><Field label="Joining date"><Input name="joiningDate" type="date" defaultValue={employee.joiningDate} /></Field><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div></form></Modal></>;
}
