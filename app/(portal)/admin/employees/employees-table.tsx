"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, UserPlus } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

interface Option {
  id: string;
  name: string;
}

interface Emp {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  position: string | null;
  salary: number | null;
  joiningDate: Date | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  pan: string | null;
  uan: string | null;
  payMode: string;
  workBasisRate: number | null;
  branch: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  managerId: string | null;
}

export function EmployeesTable({
  employees,
  branches,
  departments,
  shifts,
}: {
  employees: Emp[];
  branches: Option[];
  departments: Option[];
  shifts: Option[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<"create" | Emp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Emp | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const editing = modal && modal !== "create" ? modal : null;
    const payload: Record<string, unknown> = {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone"),
      position: form.get("position"),
      salary: form.get("salary"),
      joiningDate: form.get("joiningDate") || null,
      branchId: form.get("branchId") || null,
      departmentId: form.get("departmentId") || null,
      shiftId: form.get("shiftId") || null,
      managerId: form.get("managerId") || null,
      bankName: form.get("bankName") || null,
      accountNumber: form.get("accountNumber") || null,
      ifscCode: form.get("ifscCode") || null,
      pan: form.get("pan") || null,
      uan: form.get("uan") || null,
      payMode: form.get("payMode") || "monthly",
      workBasisRate: form.get("workBasisRate") || null,
    };
    if (!editing) payload.password = form.get("password");
    if (editing) payload.status = form.get("status");

    try {
      const res = await fetch(editing ? `/api/employees/${editing.id}` : "/api/employees", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save employee");
        return;
      }
      toast("success", editing ? "Employee updated" : "Employee added");
      setModal(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(emp: Emp) {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Employee removed");
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const editing = modal && modal !== "create" ? modal : null;

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">Manage your team members</p>
        <Button size="sm" onClick={() => setModal("create")}>
          <Plus className="h-3.5 w-3.5" /> Add employee
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Employee</TH>
            <TH className="hidden md:table-cell">Department</TH>
            <TH className="hidden lg:table-cell">Branch</TH>
            <TH className="hidden lg:table-cell">Shift</TH>
            <TH>Status</TH>
            <TH className="w-20" />
          </TR>
        </THead>
        <TBody>
          {employees.map((emp) => (
            <TR key={emp.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">
                    {(emp.firstName[0] ?? "") + (emp.lastName[0] ?? "")}
                  </div>
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {emp.firstName} {emp.lastName}
                      {emp.role === "admin" && <span className="ml-2 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">ADMIN</span>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {emp.employeeNumber} · {emp.email}
                    </p>
                  </div>
                </div>
              </TD>
              <TD className="hidden md:table-cell">
                <span className="text-[13px] text-muted-foreground">{emp.department?.name ?? "Unassigned"}</span>
              </TD>
              <TD className="hidden lg:table-cell">
                <span className="text-[13px] text-muted-foreground">{emp.branch?.name ?? "—"}</span>
              </TD>
              <TD className="hidden lg:table-cell">
                <span className="text-[13px] text-muted-foreground">{emp.shift?.name ?? "—"}</span>
              </TD>
              <TD><StatusPill status={emp.status} /></TD>
              <TD>
                <div className="flex items-center justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setModal(emp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {emp.role !== "admin" && (
                    <Button size="icon" variant="ghost" className="text-rose-300 hover:bg-rose-500/10" onClick={() => setConfirmDelete(emp)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {/* Create / edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={editing ? `Edit ${editing.firstName}` : "Add employee"}
        description={editing ? `Employee ID: ${editing.employeeNumber}` : "They'll get a default password to sign in."}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input name="firstName" required defaultValue={editing?.firstName ?? ""} />
            </Field>
            <Field label="Last name">
              <Input name="lastName" defaultValue={editing?.lastName ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required defaultValue={editing?.email ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={editing?.phone ?? ""} />
            </Field>
            {!editing && (
              <Field label="Password" hint="Employee uses this to sign in">
                <Input name="password" type="password" required minLength={6} placeholder="Min 6 characters" />
              </Field>
            )}
            <Field label="Position">
              <Input name="position" defaultValue={editing?.position ?? ""} placeholder="e.g. Software Engineer" />
            </Field>
            <Field label="Monthly salary (₹)">
              <Input name="salary" type="number" min={0} step="500" defaultValue={editing?.salary ?? ""} placeholder="e.g. 45000" />
            </Field>
            <Field label="Joining date">
              <Input name="joiningDate" type="date" defaultValue={editing?.joiningDate ? formatDate(editing.joiningDate) : ""} />
            </Field>
            <Field label="Bank name">
              <Input name="bankName" defaultValue={editing?.bankName ?? ""} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="Account number">
              <Input name="accountNumber" defaultValue={editing?.accountNumber ?? ""} placeholder="For salary bank file" />
            </Field>
            <Field label="IFSC code">
              <Input name="ifscCode" defaultValue={editing?.ifscCode ?? ""} placeholder="e.g. HDFC0001234" />
            </Field>
            <Field label="PAN">
              <Input name="pan" defaultValue={editing?.pan ?? ""} placeholder="e.g. ABCDE1234F" />
            </Field>
            <Field label="UAN (EPF)">
              <Input name="uan" defaultValue={editing?.uan ?? ""} placeholder="12-digit UAN" />
            </Field>
            <Field label="Pay mode" hint="How this employee is paid">
              <Select name="payMode" defaultValue={editing?.payMode ?? "monthly"}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily wage</option>
                <option value="weekly">Weekly wage</option>
                <option value="hourly">Hourly</option>
                <option value="work_basis">Work-basis / piece</option>
              </Select>
            </Field>
            <Field label="Work-basis rate (₹/day, optional)" hint="Piece rate for work-basis mode">
              <Input name="workBasisRate" type="number" min={0} defaultValue={editing?.workBasisRate ?? ""} placeholder="e.g. 400" />
            </Field>
            <Field label="Department">
              <Select name="departmentId" defaultValue={editing?.department?.id ?? ""}>
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Branch">
              <Select name="branchId" defaultValue={editing?.branch?.id ?? ""}>
                <option value="">Unassigned</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Shift">
              <Select name="shiftId" defaultValue={editing?.shift?.id ?? ""}>
                <option value="">No shift</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Manager" hint="Who this employee reports to">
              <Select name="managerId" defaultValue={editing?.managerId ?? ""}>
                <option value="">None</option>
                {employees
                  .filter((m) => !editing || m.id !== editing.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} ({m.employeeNumber})
                    </option>
                  ))}
              </Select>
            </Field>
            {editing && (
              <Field label="Status">
                <Select name="status" defaultValue={editing.status}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>
              {editing ? "Save changes" : <><UserPlus className="h-4 w-4" /> Add employee</>}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove employee?"
        description="This cannot be undone. Attendance history will be deleted too."
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={() => confirmDelete && remove(confirmDelete)}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </Modal>
    </>
  );
}
