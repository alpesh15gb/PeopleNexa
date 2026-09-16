"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, UserPlus, Upload, Download, Search, ImageUp, Shield, GraduationCap, BriefcaseBusiness } from "lucide-react";
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
  deviceCode: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  loginOnly: boolean;
  position: string | null;
  salary?: number | null;
  joiningDate: Date | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  pan?: string | null;
  uan?: string | null;
  aadhaarNumber: string | null;
  drivingLicenseNumber: string | null;
  drivingLicenseExpiresAt: Date | null;
  payMode?: string;
  workBasisRate?: number | null;
  branch: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  managerId: string | null;
  profilePicture: string | null;
  education: Array<{ qualification: string; specialization: string | null; institution: string; board: string | null; completionYear: number | null; grade: string | null }>;
  workExperience: Array<{ employer: string; jobTitle: string; startDate: Date; endDate: Date | null; isCurrent: boolean; location: string | null; responsibilities: string | null }>;
}

type EducationForm = { qualification: string; specialization: string; institution: string; board: string; completionYear: string; grade: string };
type ExperienceForm = { employer: string; jobTitle: string; startDate: string; endDate: string; isCurrent: boolean; location: string; responsibilities: string };
const emptyEducation = (): EducationForm => ({ qualification: "", specialization: "", institution: "", board: "", completionYear: "", grade: "" });
const emptyExperience = (): ExperienceForm => ({ employer: "", jobTitle: "", startDate: "", endDate: "", isCurrent: false, location: "", responsibilities: "" });
const dateKey = (value: Date | string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BULK_MAX = 2500;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out.map((v) =>
    v.length >= 2 && v.startsWith('"') && v.endsWith('"')
      ? v.slice(1, -1).replace(/""/g, '"').trim()
      : v
  );
}

export function EmployeesTable({
  employees,
  branches,
  departments,
  shifts,
  viewerRole,
  isLocationManager,
}: {
  employees: Emp[];
  branches: Option[];
  departments: Option[];
  shifts: Option[];
  viewerRole?: string;
  isLocationManager?: boolean;
}) {
  const restricted = isLocationManager === true || viewerRole === "location_manager";
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<"create" | Emp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Emp | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBulkOpen, setPhotoBulkOpen] = useState(false);
  const [photoBulkLoading, setPhotoBulkLoading] = useState(false);
  const [photoBulkResult, setPhotoBulkResult] = useState<string[]>([]);
  const [accessEmployee, setAccessEmployee] = useState<Emp | null>(null);
  const [accessDevices, setAccessDevices] = useState<Array<{ id: string; name: string; serialNumber: string }>>([]);
  const [accessSelected, setAccessSelected] = useState<string[]>([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [education, setEducation] = useState<EducationForm[]>([]);
  const [workExperience, setWorkExperience] = useState<ExperienceForm[]>([]);

  function openEmployee(employee: Emp | null) {
    setPhoto(null);
    setEducation(employee?.education.map((item) => ({ qualification: item.qualification, specialization: item.specialization ?? "", institution: item.institution, board: item.board ?? "", completionYear: item.completionYear?.toString() ?? "", grade: item.grade ?? "" })) ?? []);
    setWorkExperience(employee?.workExperience.map((item) => ({ employer: item.employer, jobTitle: item.jobTitle, startDate: dateKey(item.startDate), endDate: dateKey(item.endDate), isCurrent: item.isCurrent, location: item.location ?? "", responsibilities: item.responsibilities ?? "" })) ?? []);
    setModal(employee ?? "create");
  }

  async function openAccess(employee: Emp) {
    setAccessEmployee(employee); setAccessBusy(true);
    try { const data = await fetch(`/api/employees/${employee.id}/device-access`).then((res) => res.json()); setAccessDevices(data.devices ?? []); setAccessSelected(data.deviceIds ?? []); }
    finally { setAccessBusy(false); }
  }

  async function saveAccess() {
    if (!accessEmployee) return; setAccessBusy(true);
    try { const res = await fetch(`/api/employees/${accessEmployee.id}/device-access`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceIds: accessSelected }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); const failed = data.results.filter((result: { error?: string }) => result.error); toast(failed.length ? "error" : "success", failed.length ? `${failed.length} device command(s) failed.` : "Device access updated."); if (!failed.length) setAccessEmployee(null); }
    catch (error) { toast("error", error instanceof Error ? error.message : "Failed to update device access."); }
    finally { setAccessBusy(false); }
  }

  async function readPhoto(file: File): Promise<string> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
    if (file.size > 300 * 1024) throw new Error("Photo must be 300 KB or smaller.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  async function uploadBulkPhotos(files: FileList) {
    setPhotoBulkLoading(true);
    const outcomes: string[] = [];
    try {
      const items: Array<{ code: string; profilePicture: string }> = [];
      for (const file of Array.from(files)) {
        const code = file.name.replace(/\.[^.]+$/, "").trim();
        try { items.push({ code, profilePicture: await readPhoto(file) }); }
        catch (error) { outcomes.push(`${file.name}: ${error instanceof Error ? error.message : "Invalid photo."}`); }
      }
      for (let index = 0; index < items.length; index += 10) {
        const res = await fetch("/api/employees/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos: items.slice(index, index + 10) }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Photo upload failed.");
        outcomes.push(...data.results.filter((result: { error?: string }) => result.error).map((result: { code: string; error: string }) => `${result.code}: ${result.error}`));
      }
      setPhotoBulkResult(outcomes);
      toast(outcomes.length ? "info" : "success", outcomes.length ? "Some photos could not be uploaded." : `${items.length} employee photo(s) uploaded.`);
      router.refresh();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Photo upload failed.");
    } finally { setPhotoBulkLoading(false); }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const editing = modal && modal !== "create" ? modal : null;
    const payload: Record<string, unknown> = {
      firstName: form.get("firstName"),
      employeeNumber: form.get("employeeNumber"),
      deviceCode: form.get("deviceCode"),
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
      aadhaarNumber: form.get("aadhaarNumber") || null,
      drivingLicenseNumber: form.get("drivingLicenseNumber") || null,
      drivingLicenseExpiresAt: form.get("drivingLicenseExpiresAt") || null,
      payMode: form.get("payMode") || "monthly",
      workBasisRate: form.get("workBasisRate") || null,
      profilePicture: photo ?? editing?.profilePicture ?? null,
      history: { education, experience: workExperience },
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

  async function onBulkFile(file: File) {
    setBulkFileName(file.name);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) {
      setBulkRows([]);
      setBulkErrors(["File is empty."]);
      return;
    }
    const headers = splitCsvLine(lines[0]).map((h) => h.trim());
    const hasIdentifier = headers.includes("deviceCode") || headers.includes("employeeNumber") || headers.includes("email");
    const missing = hasIdentifier ? [] : ["deviceCode or employeeNumber"];
    if (missing.length > 0) {
      setBulkRows([]);
      setBulkErrors([`Missing required column(s): ${missing.join(", ")}`]);
      return;
    }
    const valid: Record<string, string>[] = [];
    const errs: string[] = [];
    const seen = new Set<string>();
    const dataLines = lines.slice(1, BULK_MAX + 1);
    dataLines.forEach((line, idx) => {
      const cols = splitCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? "").trim();
      });
      const label = row.deviceCode || row.employeeNumber || row.email || `row ${idx + 2}`;
      if (!row.deviceCode && !row.employeeNumber && !row.email) {
        errs.push(`Row ${idx + 2}: Device Code or Employee Code is required.`);
        return;
      }
      if (row.email && !EMAIL_RE.test(row.email.toLowerCase())) {
        errs.push(`Row ${idx + 2} (${label}): invalid email.`);
        return;
      }
      const key = row.deviceCode || row.employeeNumber || row.email.toLowerCase();
      if (seen.has(key)) {
        errs.push(`Row ${idx + 2} (${label}): duplicate email in file.`);
        return;
      }
      seen.add(key);
      if (row.salary) {
        const n = Number(row.salary);
        if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
          errs.push(`Row ${idx + 2} (${label}): salary must be 0–10,00,00,000.`);
          return;
        }
      }
      if (row.joiningDate) {
        const d = new Date(row.joiningDate);
        if (Number.isNaN(d.getTime())) {
          errs.push(`Row ${idx + 2} (${label}): joining date is invalid.`);
          return;
        }
      }
      valid.push(row);
    });
    if (lines.length - 1 > BULK_MAX) {
      errs.push(`Only first ${BULK_MAX} rows will be imported.`);
    }
    setBulkRows(valid);
    setBulkErrors(errs);
  }

  async function submitBulk() {
    if (bulkRows.length === 0) {
      toast("error", "No valid rows to import.");
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch("/api/employees/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bulkRows }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        updated?: number;
        failed?: { email: string; error: string }[];
      };
      if (!res.ok) {
        toast("error", data.error ?? "Bulk import failed.");
        return;
      }
      const created = data.created ?? 0;
      const failed = data.failed ?? [];
      if (failed.length > 0) {
        setBulkErrors(failed.map((f) => `${f.email}: ${f.error}`));
        toast("info", `Created ${created}, updated ${data.updated ?? 0}, ${failed.length} failed.`);
      } else {
        toast("success", `Created ${created} · updated ${data.updated ?? 0}.`);
        setBulkOpen(false);
        setBulkRows([]);
        setBulkErrors([]);
        setBulkFileName("");
      }
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  const editing = modal && modal !== "create" ? modal : null;
  const searchTerm = search.trim().toLowerCase();
  const visibleEmployees = searchTerm
    ? employees.filter((employee) => [
        employee.firstName,
        employee.lastName,
        employee.employeeNumber,
        employee.deviceCode,
        employee.email,
        employee.phone,
        employee.branch?.name,
      ].some((value) => value?.toLowerCase().includes(searchTerm)))
    : employees;

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-edge px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search name, Employee Code, or Device Code" aria-label="Search employees" />
        </div>
        <div className="flex items-center gap-2">
          {!restricted && (
            <a href="/api/employees/export" download="employees-export.csv">
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5" /> Export employees
              </Button>
            </a>
          )}
          {!restricted && (
            <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Bulk import
            </Button>
          )}
          {!restricted && (
            <Button size="sm" variant="outline" onClick={() => { setPhotoBulkResult([]); setPhotoBulkOpen(true); }}>
              <ImageUp className="h-3.5 w-3.5" /> Bulk photos
            </Button>
          )}
          <Button size="sm" onClick={() => openEmployee(null)}>
            <Plus className="h-3.5 w-3.5" /> Add employee
          </Button>
        </div>
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
          {visibleEmployees.map((emp) => (
            <TR key={emp.id}>
              <TD>
                <div className="flex items-center gap-3">
                  {emp.profilePicture ? <img src={emp.profilePicture} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-[11px] font-bold text-white">{(emp.firstName[0] ?? "") + (emp.lastName[0] ?? "")}</div>}
                  <div>
                    <p className="text-[13.5px] font-medium">
                      {emp.firstName} {emp.lastName}
                      {emp.role === "admin" && <span className="ml-2 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">ADMIN</span>}
                      {emp.loginOnly && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">MANAGER LOGIN</span>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      Code: {emp.employeeNumber}{emp.deviceCode ? ` · Device: ${emp.deviceCode}` : ""} · {emp.email}
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
                  <Button size="icon" variant="ghost" onClick={() => openEmployee(emp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!restricted && (
                    <Button size="icon" variant="ghost" title="Allowed biometric devices" onClick={() => void openAccess(emp)}><Shield className="h-3.5 w-3.5" /></Button>
                  )}
                  {!restricted && emp.role !== "admin" && (
                    <Button size="icon" variant="ghost" className="text-rose-300 hover:bg-rose-500/10" onClick={() => setConfirmDelete(emp)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
          {visibleEmployees.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-10 text-center text-[13px] text-muted-foreground">No employees match your search.</TD>
            </TR>
          )}
        </TBody>
      </Table>

      {/* Create / edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={editing ? `Edit ${editing.firstName}` : "Add employee"}
        description={editing ? `Employee ID: ${editing.employeeNumber}` : "They'll get a default password to sign in."}
      >
        <form key={editing ? editing.id : "create"} onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee photo" hint="JPEG, PNG, or WebP up to 300 KB">
              <div className="flex items-center gap-3">
                {(photo ?? editing?.profilePicture) ? <img src={photo ?? editing?.profilePicture ?? ""} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-tint text-xs text-muted-foreground">Photo</div>}
                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readPhoto(file).then(setPhoto).catch((error) => toast("error", error.message)); }} />
              </div>
            </Field>
            <Field label="First name">
              <Input name="firstName" required defaultValue={editing?.firstName ?? ""} />
            </Field>
            <Field label="Last name">
              <Input name="lastName" defaultValue={editing?.lastName ?? ""} />
            </Field>
            <Field label="Employee Code" hint={editing ? "HR/company code; editable" : "Leave blank to use Device Code or auto-generate"}>
              <Input name="employeeNumber" required={Boolean(editing)} defaultValue={editing?.employeeNumber ?? ""} placeholder="e.g. MNP0675" />
            </Field>
            <Field label="Device Code" hint="eBio enrollment ID used for attendance matching">
              <Input name="deviceCode" defaultValue={editing?.deviceCode ?? ""} placeholder="e.g. 8767" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required defaultValue={editing?.email ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={editing?.phone ?? ""} />
            </Field>
            {!editing && (
              <Field label="Password" hint="Employee uses this to sign in">
                <Input name="password" type="password" required minLength={12} placeholder="Min 12 characters" />
              </Field>
            )}
            <Field label="Position">
              <Input name="position" defaultValue={editing?.position ?? ""} placeholder="e.g. Software Engineer" />
            </Field>
            {!restricted && (
              <Field label="Monthly salary (₹)">
                <Input name="salary" type="number" min={0} step="500" defaultValue={editing?.salary ?? ""} placeholder="e.g. 45000" />
              </Field>
            )}
            <Field label="Joining date">
              <Input name="joiningDate" type="date" defaultValue={editing?.joiningDate ? formatDate(editing.joiningDate) : ""} />
            </Field>
            {!restricted && (
              <Field label="Bank name">
                <Input name="bankName" defaultValue={editing?.bankName ?? ""} placeholder="e.g. HDFC Bank" />
              </Field>
            )}
            {!restricted && (
              <Field label="Account number">
                <Input name="accountNumber" defaultValue={editing?.accountNumber ?? ""} placeholder="For salary bank file" />
              </Field>
            )}
            {!restricted && (
              <Field label="IFSC code">
                <Input name="ifscCode" defaultValue={editing?.ifscCode ?? ""} placeholder="e.g. HDFC0001234" />
              </Field>
            )}
            {!restricted && (
              <Field label="PAN">
                <Input name="pan" defaultValue={editing?.pan ?? ""} placeholder="e.g. ABCDE1234F" />
              </Field>
            )}
            {!restricted && (
              <Field label="UAN (EPF)">
                <Input name="uan" defaultValue={editing?.uan ?? ""} placeholder="12-digit UAN" />
              </Field>
            )}
            <Field label="Aadhaar Number">
              <Input name="aadhaarNumber" inputMode="numeric" maxLength={14} defaultValue={editing?.aadhaarNumber ?? ""} placeholder="12-digit Aadhaar" />
            </Field>
            <Field label="Driving License Number">
              <Input name="drivingLicenseNumber" defaultValue={editing?.drivingLicenseNumber ?? ""} placeholder="e.g. DL0120110012345" />
            </Field>
            <Field label="Driving License Expiry">
              <Input name="drivingLicenseExpiresAt" type="date" defaultValue={editing?.drivingLicenseExpiresAt ? formatDate(editing.drivingLicenseExpiresAt) : ""} />
            </Field>
            {!restricted && (
              <Field label="Pay mode" hint="How this employee is paid">
                <Select name="payMode" defaultValue={editing?.payMode ?? "monthly"}>
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily wage</option>
                  <option value="weekly">Weekly wage</option>
                  <option value="hourly">Hourly</option>
                  <option value="work_basis">Work-basis / piece</option>
                </Select>
              </Field>
            )}
            {!restricted && (
              <Field label="Work-basis rate (₹/day, optional)" hint="Piece rate for work-basis mode">
                <Input name="workBasisRate" type="number" min={0} defaultValue={editing?.workBasisRate ?? ""} placeholder="e.g. 400" />
              </Field>
            )}
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
          <section className="space-y-3 rounded-xl border border-edge bg-tint/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4" /> Education</h3><p className="text-xs text-muted-foreground">Add qualifications held by this employee.</p></div>
              <Button type="button" size="sm" variant="outline" disabled={education.length >= 10} onClick={() => setEducation((items) => [...items, emptyEducation()])}><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
            {education.map((item, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-edge bg-card p-3">
                <div className="flex justify-between"><p className="text-xs font-medium text-muted-foreground">Qualification {index + 1}</p><Button type="button" size="sm" variant="ghost" className="text-rose-300" onClick={() => setEducation((items) => items.filter((_, i) => i !== index))}>Remove</Button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input required value={item.qualification} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, qualification: e.target.value } : row))} placeholder="Qualification, e.g. B.Tech" aria-label={`Education ${index + 1} qualification`} />
                  <Input value={item.specialization} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, specialization: e.target.value } : row))} placeholder="Specialization" aria-label={`Education ${index + 1} specialization`} />
                  <Input required value={item.institution} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, institution: e.target.value } : row))} placeholder="Institution / college" aria-label={`Education ${index + 1} institution`} />
                  <Input value={item.board} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, board: e.target.value } : row))} placeholder="Board / university" aria-label={`Education ${index + 1} board or university`} />
                  <Input type="number" min="1950" max={new Date().getFullYear() + 1} value={item.completionYear} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, completionYear: e.target.value } : row))} placeholder="Completion year" aria-label={`Education ${index + 1} completion year`} />
                  <Input value={item.grade} onChange={(e) => setEducation((items) => items.map((row, i) => i === index ? { ...row, grade: e.target.value } : row))} placeholder="Grade / percentage" aria-label={`Education ${index + 1} grade`} />
                </div>
              </div>
            ))}
          </section>
          <section className="space-y-3 rounded-xl border border-edge bg-tint/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="flex items-center gap-2 text-sm font-semibold"><BriefcaseBusiness className="h-4 w-4" /> Work experience</h3><p className="text-xs text-muted-foreground">Add previous employers and current role history.</p></div>
              <Button type="button" size="sm" variant="outline" disabled={workExperience.length >= 10} onClick={() => setWorkExperience((items) => [...items, emptyExperience()])}><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
            {workExperience.map((item, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-edge bg-card p-3">
                <div className="flex justify-between"><p className="text-xs font-medium text-muted-foreground">Employer {index + 1}</p><Button type="button" size="sm" variant="ghost" className="text-rose-300" onClick={() => setWorkExperience((items) => items.filter((_, i) => i !== index))}>Remove</Button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input required value={item.employer} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, employer: e.target.value } : row))} placeholder="Employer" aria-label={`Experience ${index + 1} employer`} />
                  <Input required value={item.jobTitle} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, jobTitle: e.target.value } : row))} placeholder="Job title" aria-label={`Experience ${index + 1} job title`} />
                  <Input required type="date" value={item.startDate} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, startDate: e.target.value } : row))} aria-label={`Experience ${index + 1} start date`} />
                  <Input required={!item.isCurrent} disabled={item.isCurrent} type="date" value={item.endDate} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, endDate: e.target.value } : row))} aria-label={`Experience ${index + 1} end date`} />
                  <Input value={item.location} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, location: e.target.value } : row))} placeholder="Work location" aria-label={`Experience ${index + 1} work location`} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.isCurrent} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, isCurrent: e.target.checked, endDate: e.target.checked ? "" : row.endDate } : row))} /> Current role</label>
                </div>
                <textarea value={item.responsibilities} onChange={(e) => setWorkExperience((items) => items.map((row, i) => i === index ? { ...row, responsibilities: e.target.value } : row))} placeholder="Key responsibilities (optional)" aria-label={`Experience ${index + 1} responsibilities`} className="min-h-20 w-full rounded-xl border border-input bg-card-2 px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40" />
              </div>
            ))}
          </section>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>
              {editing ? "Save changes" : <><UserPlus className="h-4 w-4" /> Add employee</>}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={accessEmployee !== null} onClose={() => setAccessEmployee(null)} title={`Allowed devices: ${accessEmployee?.firstName ?? ""}`} description="Selected devices are unblocked; all other eBio devices are blocked for this employee.">
        <div className="space-y-3">{accessBusy && accessDevices.length === 0 ? <p className="text-sm text-muted-foreground">Loading devices…</p> : accessDevices.map((device) => <label key={device.id} className="flex items-center gap-3 rounded-lg border border-edge p-3 text-sm"><input type="checkbox" checked={accessSelected.includes(device.id)} onChange={() => setAccessSelected((current) => current.includes(device.id) ? current.filter((id) => id !== device.id) : [...current, device.id])} /><span className="flex-1">{device.name}<span className="block font-mono text-xs text-muted-foreground">{device.serialNumber}</span></span></label>)}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAccessEmployee(null)}>Cancel</Button><Button loading={accessBusy} onClick={() => void saveAccess()}>Apply device access</Button></div></div>
      </Modal>

      <Modal open={photoBulkOpen} onClose={() => setPhotoBulkOpen(false)} title="Bulk upload employee photos" description="Select multiple JPEG, PNG, or WebP files. Each filename must match a Device Code or Employee Code, for example 3947.jpg or MN3947.png.">
        <div className="space-y-4">
          <Field label="Employee photo files" hint="Up to 300 KB per image; photos are matched by filename">
            <Input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={photoBulkLoading} onChange={(event) => { const files = event.target.files; if (files?.length) void uploadBulkPhotos(files); }} />
          </Field>
          {photoBulkResult.length > 0 && <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-edge bg-card p-3 text-[12.5px] text-rose-300">{photoBulkResult.map((result) => <li key={result}>{result}</li>)}</ul>}
          <div className="flex justify-end"><Button variant="ghost" onClick={() => setPhotoBulkOpen(false)}>Close</Button></div>
        </div>
      </Modal>

      {/* Bulk import modal */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk import employees"
        description="Upload up to 2,500 CSV rows. Existing employees are updated by Device Code first, then Employee Code; blank fields are left unchanged."
      >
        <div className="space-y-4">
          <a
            href="/api/employees/bulk"
            download="employees-template.csv"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-300 hover:text-indigo-200"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV template
          </a>
          <p className="rounded-xl border border-edge bg-tint px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            Required: <span className="font-medium text-foreground">Device Code or Employee Code</span>. Email, Branch, and Department are optional. Enter Branch and Department names; missing names are created automatically. Use workspace IDs only for shiftId and managerId. Do not include passwords in CSV files.
          </p>
          <Field label="CSV file (.csv)">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onBulkFile(f);
              }}
            />
          </Field>
          {bulkFileName && (
            <p className="text-[13px] text-muted-foreground">
              {bulkFileName} — {bulkRows.length} row{bulkRows.length === 1 ? "" : "s"} ready
              {bulkErrors.length > 0 && `, ${bulkErrors.length} error${bulkErrors.length === 1 ? "" : "s"}`}
            </p>
          )}
          {bulkErrors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-edge bg-card p-3 text-[12.5px] text-rose-300">
              {bulkErrors.slice(0, 20).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {bulkErrors.length > 20 && <li>…and {bulkErrors.length - 20} more</li>}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={bulkLoading}
              disabled={bulkRows.length === 0}
              onClick={() => void submitBulk()}
            >
              <Upload className="h-4 w-4" /> Import {bulkRows.length > 0 ? `(${bulkRows.length})` : ""}
            </Button>
          </div>
        </div>
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
