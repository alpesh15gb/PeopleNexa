"use client";

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, ChevronRight, CreditCard, FileText, GraduationCap, Pencil, Plus, Trash2, UserRound, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

type EmployeeForm = { id?: string; employeeNumber?: string | null; deviceCode?: string | null; firstName: string; lastName: string; email: string; phone: string | null; position: string | null; status?: string; payMode?: string | null; joiningDate: string; profilePicture?: string | null; drivingLicenseNumber?: string | null; drivingLicenseType?: string | null; drivingLicenseExpiresAt?: string };
type Row = Record<string, unknown>;
type Master = Row & { profile?: Row | null; employmentProfile?: Row | null; dependents?: Row[]; education?: Row[]; workExperience?: Row[]; references?: Row[]; bankAccounts?: Row[]; documents?: Row[] };
type EmployeeMasterLookups = { branches: Array<{ id: string; name: string }>; departments: Array<{ id: string; name: string }>; shifts: Array<{ id: string; name: string }>; managers: Array<{ id: string; firstName: string; lastName: string; employeeNumber: string }>; positions: string[]; subdepartments: string[] };
const emptyLookups: EmployeeMasterLookups = { branches: [], departments: [], shifts: [], managers: [], positions: [], subdepartments: [] };
const EmployeeMasterLookupsContext = createContext<EmployeeMasterLookups>(emptyLookups);

const inputClass = "h-11 w-full rounded-[11px] border border-input bg-card px-3.5 text-sm text-foreground outline-none transition focus:border-primary/70 focus:ring-4 focus:ring-ring/15";
const employmentModes = ["Full time", "Part time", "Contract", "Internship", "Consultant"];
const employmentNatures = ["Permanent", "Temporary", "Fixed term", "Probation", "Trainee"];
const salaryPaymentModes = ["Bank transfer", "Cash", "Cheque"];
const maritalStatuses = ["Single", "Married", "Divorced", "Widowed", "Separated"];
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const payModes = [{ value: "monthly", label: "Monthly" }, { value: "daily", label: "Daily wage" }, { value: "weekly", label: "Weekly wage" }, { value: "hourly", label: "Hourly" }, { value: "work_basis", label: "Work-basis / piece" }];
const sections = [
  ["official", "Official", Building2], ["personal", "Personal", UserRound], ["dependents", "Dependents", UsersRound], ["education", "Education", GraduationCap], ["experience", "Experience", Building2], ["references", "References", UsersRound], ["banking", "Bank accounts", CreditCard], ["documents", "Documents", FileText],
] as const;

function dateValue(value: unknown) { return typeof value === "string" ? value.slice(0, 10) : ""; }
function stringValue(value: unknown) { return value == null ? "" : String(value); }
function addressRecord(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...(value as Row) };
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Row) } : { addressLine: value };
  } catch { return { addressLine: value }; }
}

function addressForSave(value: unknown): Row | null {
  const address = addressRecord(value);
  return Object.keys(address).length ? address : null;
}
async function readPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > 300 * 1024) throw new Error("Photo must be 300 KB or smaller.");
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read photo.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
}
function normalizeDates(master: Master): Master {
  const dateFields = (row: Row, keys: string[]) => ({ ...row, ...Object.fromEntries(keys.map((key) => [key, dateValue(row[key])])) });
  const dateRows = (key: keyof Master, keys: string[]) => ((master[key] as Row[] | undefined) ?? []).map((row) => dateFields(row, keys));
  return {
    ...master,
    joiningDate: dateValue(master.joiningDate),
    profile: master.profile ? dateFields(master.profile, ["dateOfBirthCertificate", "actualDateOfBirth", "marriageDate"]) : master.profile,
    employmentProfile: master.employmentProfile ? dateFields(master.employmentProfile, ["rejoiningDate", "statusUpdatedAt"]) : master.employmentProfile,
    dependents: dateRows("dependents", ["dateOfBirth"]),
    education: dateRows("education", ["startDate"]),
    workExperience: dateRows("workExperience", ["startDate", "endDate"]),
    documents: dateRows("documents", ["issuedDate", "expiryDate"]),
  };
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: unknown; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder: string }) {
  const current = stringValue(value);
  const visibleOptions = current && !options.some((option) => option.value === current) ? [{ value: current, label: `Current value: ${current}` }, ...options] : options;
  return <Field label={label}><select value={current} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">{placeholder}</option>{visibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;
}

function CustomSelectField({ label, value, onChange, options }: { label: string; value: unknown; onChange?: (value: string) => void; options: string[] }) {
  const text = stringValue(value);
  const [uncontrolledValue, setUncontrolledValue] = useState(text);
  const [custom, setCustom] = useState(() => options.length === 0 || (Boolean(text) && !options.includes(text)));
  const current = onChange ? text : uncontrolledValue;
  const update = (next: string) => { if (onChange) onChange(next); else setUncontrolledValue(next); };
  return <div className="space-y-3">
    <Field label={label}>
      <select name={label === "Position" && !custom ? "position" : undefined} value={custom ? "__custom__" : current} onChange={(event) => { const next = event.target.value; setCustom(next === "__custom__"); update(next === "__custom__" ? "" : next); }} className={inputClass}>
        <option value="">{`Select ${label.toLowerCase()}`}</option>
        {current && !options.includes(current) && <option value={current}>Current value: {current}</option>}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
        <option value="__custom__">Custom entry</option>
      </select>
    </Field>
    {custom && <Field label={`Custom ${label.toLowerCase()}`}><Input name={label === "Position" ? "position" : undefined} value={current} onChange={(event) => update(event.target.value)} /></Field>}
  </div>;
}

function EmployeeFields({ employee, includeCodes = false, controlled, setControlled, positionChoices }: { employee: EmployeeForm; includeCodes?: boolean; controlled?: Row; setControlled?: (key: string, value: string) => void; positionChoices?: string[] }) {
  const lookups = useContext(EmployeeMasterLookupsContext);
  const value = (key: string) => controlled ? stringValue(controlled[key]) : undefined;
  const change = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setControlled?.(key, event.target.value);
  const positionOptions = positionChoices ?? (controlled || includeCodes ? lookups.positions : undefined);
  return <><Field label="First name"><Input name="firstName" required value={value("firstName")} onChange={change("firstName")} defaultValue={controlled ? undefined : employee.firstName} /></Field><Field label="Last name"><Input name="lastName" value={value("lastName")} onChange={change("lastName")} defaultValue={controlled ? undefined : employee.lastName} /></Field>{includeCodes && <Field label="Employee code"><Input name="employeeNumber" required value={value("employeeNumber")} onChange={change("employeeNumber")} defaultValue={controlled ? undefined : employee.employeeNumber ?? ""} /></Field>}{includeCodes && <Field label="Device code"><Input name="deviceCode" placeholder="Biometric enrollment ID" value={value("deviceCode")} onChange={change("deviceCode")} defaultValue={controlled ? undefined : employee.deviceCode ?? ""} /></Field>}<Field label="Work email"><Input name="email" type="email" required value={value("email")} onChange={change("email")} defaultValue={controlled ? undefined : employee.email} /></Field><Field label="Phone"><Input name="phone" type="tel" value={value("phone")} onChange={change("phone")} defaultValue={controlled ? undefined : employee.phone ?? ""} /></Field>{positionOptions ? <CustomSelectField label="Position" value={controlled?.position} onChange={(next) => setControlled?.("position", next)} options={positionOptions} /> : <Field label="Position"><Input name="position" value={value("position")} onChange={change("position")} defaultValue={controlled ? undefined : employee.position ?? ""} /></Field>}<Field label="Joining date"><Input name="joiningDate" type="date" value={controlled ? dateValue(controlled.joiningDate) : undefined} onChange={change("joiningDate")} defaultValue={controlled ? undefined : employee.joiningDate} /></Field></>;
}

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: unknown; onChange: (value: string) => void; type?: string; required?: boolean }) {
  const lookups = useContext(EmployeeMasterLookupsContext);
  if (label === "Gender") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select gender" options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }, { value: "Other", label: "Other" }, { value: "Prefer not to say", label: "Prefer not to say" }]} />;
  if (label === "Marital status") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select marital status" options={maritalStatuses.map((status) => ({ value: status, label: status }))} />;
  if (label === "Blood group") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select blood group" options={bloodGroups.map((group) => ({ value: group, label: group }))} />;
  if (label === "Employment mode") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select employment mode" options={employmentModes.map((mode) => ({ value: mode, label: mode }))} />;
  if (label === "Nature of employment") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select employment nature" options={employmentNatures.map((nature) => ({ value: nature, label: nature }))} />;
  if (label === "Salary payment mode") return <SelectField label={label} value={value} onChange={onChange} placeholder="Select salary payment mode" options={salaryPaymentModes.map((mode) => ({ value: mode, label: mode }))} />;
  if (label === "Sub department") return <CustomSelectField label={label} value={value} onChange={onChange} options={lookups.subdepartments} />;
  return <Field label={label}><Input type={type} required={required} value={type === "date" ? dateValue(value) : stringValue(value)} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function AddressFields({ title, value, onChange }: { title: string; value: unknown; onChange: (value: Row) => void }) {
  const address = addressRecord(value);
  const field = (key: string, fallbacks: string[] = []) => stringValue(address[key] ?? fallbacks.map((fallback) => address[fallback]).find((fallback) => fallback != null) ?? "");
  const addressLine = field("addressLine", ["line1"]) || [address.flatHouseWingNumber, address.streetLocalityArea].filter((part) => part != null && String(part).trim()).map(String).join(", ");
  const update = (key: string) => (next: string) => onChange({ ...address, [key]: next });
  return <fieldset className="rounded-xl border border-edge bg-tint/20 p-4"><legend className="px-1 text-sm font-semibold">{title}</legend><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><TextField label="Address line" value={addressLine} onChange={update("addressLine")} /></div><TextField label="City" value={field("city", ["district", "town"])} onChange={update("city")} /><TextField label="State" value={field("state")} onChange={update("state")} /><TextField label="Postal code" value={field("postalCode", ["pinCode", "pincode", "zipCode"])} onChange={update("postalCode")} /></div></fieldset>;
}

function OfficialLookupFields({ core, updateCore, employeeId }: { core: Row; updateCore: (key: string, value: string) => void; employeeId: string }) {
  const lookups = useContext(EmployeeMasterLookupsContext);
  return <><SelectField label="Branch" value={core.branchId} onChange={(value) => updateCore("branchId", value)} placeholder="Unassigned" options={lookups.branches.map((branch) => ({ value: branch.id, label: branch.name }))} /><SelectField label="Department" value={core.departmentId} onChange={(value) => updateCore("departmentId", value)} placeholder="Unassigned" options={lookups.departments.map((department) => ({ value: department.id, label: department.name }))} /><SelectField label="Shift" value={core.shiftId} onChange={(value) => updateCore("shiftId", value)} placeholder="Unassigned" options={lookups.shifts.map((shift) => ({ value: shift.id, label: shift.name }))} /><SelectField label="Reporting manager" value={core.managerId} onChange={(value) => updateCore("managerId", value)} placeholder="No manager" options={lookups.managers.filter((manager) => manager.id !== employeeId).map((manager) => ({ value: manager.id, label: `${manager.firstName} ${manager.lastName} (${manager.employeeNumber})` }))} /><SelectField label="Pay mode" value={core.payMode} onChange={(value) => updateCore("payMode", value)} placeholder="Select pay mode" options={payModes} /></>;
}

function LicenseFields({ core, updateCore }: { core: Row; updateCore: (key: string, value: string) => void }) {
  return <><TextField label="Driving licence number" value={core.drivingLicenseNumber} onChange={(value) => updateCore("drivingLicenseNumber", value)} /><SelectField label="Licence type" value={core.drivingLicenseType} onChange={(value) => updateCore("drivingLicenseType", value)} placeholder="Select licence type" options={[{ value: "learner", label: "Learner's" }, { value: "permanent", label: "Permanent" }, { value: "commercial", label: "Commercial" }, { value: "international", label: "International" }]} /><TextField label="Licence expiry" type="date" value={core.drivingLicenseExpiresAt} onChange={(value) => updateCore("drivingLicenseExpiresAt", value)} /><TextField label="Reset password" type="password" value={core.password} onChange={(value) => updateCore("password", value)} /></>;
}

function EmploymentStatusField({ core, updateCore }: { core: Row; updateCore: (key: string, value: string) => void }) {
  return <SelectField label="Employment status" value={core.status} onChange={(value) => updateCore("status", value)} placeholder="Select status" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />;
}

function EmployeePhotoField({ core, updateCore }: { core: Row; updateCore: (key: string, value: string) => void }) {
  const toast = useToast();
  return <Field label="Employee photo" hint="JPEG, PNG, or WebP up to 300 KB"><div className="flex items-center gap-3">{core.profilePicture ? <img src={stringValue(core.profilePicture)} alt="Employee preview" className="h-14 w-14 rounded-lg object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-tint text-xs text-muted-foreground">Photo</div>}<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readPhoto(file).then((value) => updateCore("profilePicture", value)).catch((error) => toast("error", error instanceof Error ? error.message : "Could not read photo.")); }} /></div></Field>;
}

function Editor({ id, initial, onClose, canEditEmail, lookups = emptyLookups }: { id: string; initial: EmployeeForm; onClose: () => void; canEditEmail: boolean; lookups?: EmployeeMasterLookups }) {
  const toast = useToast();
  const router = useRouter();
  const [master, setMaster] = useState<Master | null>(null);
  const [core, setCore] = useState<Row>({ ...initial });
  const [active, setActive] = useState("official");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/employees/${id}/master`).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load employee master.");
      if (!cancelled) { const employee = normalizeDates(data.employee); setMaster(employee); setCore(employee); }
    }).catch((error) => { if (!cancelled) toast("error", error instanceof Error ? error.message : "Could not load employee master."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, toast]);

  const updateCore = (key: string, value: string) => setCore((current) => ({ ...current, [key]: value }));
  const updateGroup = (group: "profile" | "employmentProfile", key: string, value: unknown) => setMaster((current) => current ? { ...current, [group]: { ...(current[group] ?? {}), [key]: value } } : current);
  const rows = (key: keyof Master) => (master?.[key] as Row[] | undefined) ?? [];
  const updateRows = (key: keyof Master, next: Row[]) => setMaster((current) => current ? { ...current, [key]: next } : current);
  const addRow = (key: keyof Master, row: Row) => updateRows(key, [...rows(key), row]);
  const updateRow = (key: keyof Master, index: number, field: string, value: unknown) => updateRows(key, rows(key).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const removeRow = (key: keyof Master, index: number) => updateRows(key, rows(key).filter((_, rowIndex) => rowIndex !== index));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!master) return;
    setSaving(true);
    try {
      const profile = { ...(master.profile ?? {}) };
      for (const address of ["currentAddress", "permanentAddress"] as const) {
        const value = addressForSave(profile[address]);
        const label = address === "currentAddress" ? "Current address" : "Permanent address";
        for (const field of ["addressLine", "city", "state", "postalCode"]) {
          const fieldValue = value?.[field];
          if (typeof fieldValue === "string" && fieldValue.trim().length > 2_000) throw new Error(`${label} ${field === "addressLine" ? "line" : field === "postalCode" ? "postal code" : field} must be 2,000 characters or fewer.`);
        }
        const postalCode = value?.postalCode;
        if (typeof postalCode === "string" && postalCode.trim() && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,18}$/.test(postalCode.trim())) throw new Error(`${label} postal code can use only letters, numbers, spaces, and hyphens.`);
        profile[address] = value;
      }
      const corePayload: Row = { employeeNumber: core.employeeNumber, deviceCode: core.deviceCode, firstName: core.firstName, lastName: core.lastName, phone: core.phone, position: core.position, status: core.status, payMode: core.payMode, joiningDate: core.joiningDate || null, branchId: core.branchId || null, departmentId: core.departmentId || null, shiftId: core.shiftId || null, managerId: core.managerId || null, profilePicture: core.profilePicture ?? null, drivingLicenseNumber: core.drivingLicenseNumber || null, drivingLicenseType: core.drivingLicenseType || null, drivingLicenseExpiresAt: core.drivingLicenseExpiresAt || null, ...(core.password ? { password: core.password } : {}) };
      if (canEditEmail) corePayload.email = core.email;
      const coreResponse = await fetch(`/api/employees/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corePayload) });
      const coreData = await coreResponse.json().catch(() => ({}));
      if (!coreResponse.ok) throw new Error(coreData.error ?? "Could not update official details.");
      if (core.status !== master.status && core.deviceCode) {
        const deviceResponse = await fetch(`/api/employees/${id}/device-access`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: core.status === "inactive" ? "restricted" : "all", deviceIds: [] }) });
        if (!deviceResponse.ok && deviceResponse.status !== 207) toast("error", "Employee status was saved, but device access could not be updated.");
      }
      const masterResponse = await fetch(`/api/employees/${id}/master`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, employment: master.employmentProfile ?? {}, dependents: rows("dependents"), education: rows("education"), workExperience: rows("workExperience"), references: rows("references"), bankAccounts: rows("bankAccounts"), documents: rows("documents") }) });
      const masterData = await masterResponse.json().catch(() => ({}));
      if (!masterResponse.ok) throw new Error(masterData.error ?? "Could not update employee master.");
      toast("success", "Employee master saved"); onClose(); router.refresh();
    } catch (error) { toast("error", error instanceof Error ? error.message : "Could not save employee master."); }
    finally { setSaving(false); }
  }

  const profile = master?.profile ?? {};
  const employment = master?.employmentProfile ?? {};
  return <EmployeeMasterLookupsContext.Provider value={lookups}><Modal open onClose={onClose} size="xl" title="Employee master editor" description="Update core information and structured HR records in one place.">
    {loading || !master ? <div className="py-16 text-center text-sm text-muted-foreground">Loading employee master...</div> : <form onSubmit={save} className="grid min-h-[62vh] gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Employee master sections" className="flex gap-1 overflow-x-auto border-b border-edge pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        {sections.map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setActive(key)} aria-current={active === key ? "step" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full ${active === key ? "bg-primary text-white" : "text-muted-foreground hover:bg-tint hover:text-foreground"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}<ChevronRight className="ml-auto hidden h-3.5 w-3.5 lg:block" aria-hidden="true" /></button>)}
      </nav>
      <div className="min-w-0 space-y-5">
        {active === "official" && <div className="grid gap-4 sm:grid-cols-2"><EmployeePhotoField core={core} updateCore={updateCore} /></div>}
        {active === "official" && <section aria-labelledby="official-heading" className="space-y-5"><div><h3 id="official-heading" className="text-base font-semibold">Official and employment</h3><p className="text-sm text-muted-foreground">Identity, work contact, and employment classification.</p></div><div className="grid gap-4 sm:grid-cols-2"><EmployeeFields includeCodes controlled={core} setControlled={updateCore} employee={{ ...initial, firstName: stringValue(core.firstName), lastName: stringValue(core.lastName), email: stringValue(core.email), phone: stringValue(core.phone), position: stringValue(core.position), joiningDate: dateValue(core.joiningDate) }} /><TextField label="Employment mode" value={employment.employmentMode} onChange={(value) => updateGroup("employmentProfile", "employmentMode", value)} /><TextField label="Nature of employment" value={employment.natureOfEmployment} onChange={(value) => updateGroup("employmentProfile", "natureOfEmployment", value)} /><TextField label="Probation period" value={employment.probationPeriod} onChange={(value) => updateGroup("employmentProfile", "probationPeriod", value)} /><TextField label="Total experience" value={employment.totalExperience} onChange={(value) => updateGroup("employmentProfile", "totalExperience", value)} /><TextField label="Sub department" value={employment.subDepartment} onChange={(value) => updateGroup("employmentProfile", "subDepartment", value)} /><TextField label="Grade" value={employment.grade} onChange={(value) => updateGroup("employmentProfile", "grade", value)} /><TextField label="CTC" type="number" value={employment.ctc} onChange={(value) => updateGroup("employmentProfile", "ctc", value)} /><TextField label="Salary group" value={employment.salaryGroup} onChange={(value) => updateGroup("employmentProfile", "salaryGroup", value)} /><TextField label="Salary payment mode" value={employment.salaryPaymentMode} onChange={(value) => updateGroup("employmentProfile", "salaryPaymentMode", value)} /></div></section>}
        {active === "personal" && <section aria-labelledby="personal-heading" className="space-y-5"><div><h3 id="personal-heading" className="text-base font-semibold">Personal profile</h3><p className="text-sm text-muted-foreground">Private identity and emergency details.</p></div><div className="grid gap-4 sm:grid-cols-2"><TextField label="Middle name" value={profile.middleName} onChange={(value) => updateGroup("profile", "middleName", value)} /><TextField label="Name as on Aadhaar" value={profile.nameAsOnAadhaar} onChange={(value) => updateGroup("profile", "nameAsOnAadhaar", value)} /><TextField label="Gender" value={profile.gender} onChange={(value) => updateGroup("profile", "gender", value)} /><TextField label="Marital status" value={profile.maritalStatus} onChange={(value) => updateGroup("profile", "maritalStatus", value)} /><TextField label="Date of birth" type="date" value={profile.actualDateOfBirth} onChange={(value) => updateGroup("profile", "actualDateOfBirth", value)} /><TextField label="Personal email" type="email" value={profile.personalEmail} onChange={(value) => updateGroup("profile", "personalEmail", value)} /><TextField label="WhatsApp number" type="tel" value={profile.whatsappNumber} onChange={(value) => updateGroup("profile", "whatsappNumber", value)} /><TextField label="Blood group" value={profile.bloodGroup} onChange={(value) => updateGroup("profile", "bloodGroup", value)} /><TextField label="Father's name" value={profile.fatherName} onChange={(value) => updateGroup("profile", "fatherName", value)} /><TextField label="Mother's name" value={profile.motherName} onChange={(value) => updateGroup("profile", "motherName", value)} /><TextField label="Emergency contact name" value={profile.emergencyContactName} onChange={(value) => updateGroup("profile", "emergencyContactName", value)} /><TextField label="Emergency contact number" type="tel" value={profile.emergencyContactNumber} onChange={(value) => updateGroup("profile", "emergencyContactNumber", value)} /></div></section>}
        {active === "personal" && <section aria-label="Addresses" className="space-y-4"><AddressFields title="Current address" value={profile.currentAddress} onChange={(value) => updateGroup("profile", "currentAddress", value)} /><AddressFields title="Permanent address" value={profile.permanentAddress} onChange={(value) => updateGroup("profile", "permanentAddress", value)} /></section>}
        {active === "dependents" && <Collection title="Dependents" rows={rows("dependents")} add={() => addRow("dependents", { firstName: "", relation: "" })} remove={(index) => removeRow("dependents", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="First name" required value={row.firstName} onChange={(value) => updateRow("dependents", index, "firstName", value)} /><TextField label="Relation" value={row.relation} onChange={(value) => updateRow("dependents", index, "relation", value)} /><TextField label="Date of birth" type="date" value={row.dateOfBirth} onChange={(value) => updateRow("dependents", index, "dateOfBirth", value)} /><TextField label="Mobile" type="tel" value={row.mobile} onChange={(value) => updateRow("dependents", index, "mobile", value)} /><TextField label="Nominee share (%)" type="number" value={row.nomineeShare} onChange={(value) => updateRow("dependents", index, "nomineeShare", value)} /></div>}</Collection>}
        {active === "education" && <Collection title="Education" rows={rows("education")} add={() => addRow("education", { qualification: "", institution: "" })} remove={(index) => removeRow("education", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="Qualification" required value={row.qualification} onChange={(value) => updateRow("education", index, "qualification", value)} /><TextField label="Institution" required value={row.institution} onChange={(value) => updateRow("education", index, "institution", value)} /><TextField label="Specialization" value={row.specialization} onChange={(value) => updateRow("education", index, "specialization", value)} /><TextField label="Completion year" type="number" value={row.completionYear} onChange={(value) => updateRow("education", index, "completionYear", value)} /></div>}</Collection>}
        {active === "experience" && <Collection title="Work experience" rows={rows("workExperience")} add={() => addRow("workExperience", { employer: "", jobTitle: "", startDate: "" })} remove={(index) => removeRow("workExperience", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="Employer" required value={row.employer} onChange={(value) => updateRow("workExperience", index, "employer", value)} /><TextField label="Job title" required value={row.jobTitle} onChange={(value) => updateRow("workExperience", index, "jobTitle", value)} /><TextField label="Start date" required type="date" value={row.startDate} onChange={(value) => updateRow("workExperience", index, "startDate", value)} /><TextField label="End date" type="date" value={row.endDate} onChange={(value) => updateRow("workExperience", index, "endDate", value)} /><TextField label="Location" value={row.location} onChange={(value) => updateRow("workExperience", index, "location", value)} /><TextField label="Reason for leaving" value={row.reasonForLeaving} onChange={(value) => updateRow("workExperience", index, "reasonForLeaving", value)} /></div>}</Collection>}
        {active === "references" && <Collection title="References" rows={rows("references")} add={() => addRow("references", { name: "" })} remove={(index) => removeRow("references", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="Name" required value={row.name} onChange={(value) => updateRow("references", index, "name", value)} /><TextField label="Relation" value={row.relation} onChange={(value) => updateRow("references", index, "relation", value)} /><TextField label="Mobile" type="tel" value={row.mobile} onChange={(value) => updateRow("references", index, "mobile", value)} /><TextField label="Email" type="email" value={row.email} onChange={(value) => updateRow("references", index, "email", value)} /></div>}</Collection>}
        {active === "banking" && <Collection title="Bank accounts" rows={rows("bankAccounts")} add={() => addRow("bankAccounts", { accountNumber: "", isPrimary: rows("bankAccounts").length === 0 })} remove={(index) => removeRow("bankAccounts", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="Account number" required value={row.accountNumber} onChange={(value) => updateRow("bankAccounts", index, "accountNumber", value)} /><TextField label="IFSC code" value={row.ifscCode} onChange={(value) => updateRow("bankAccounts", index, "ifscCode", value)} /><TextField label="Bank name" value={row.bankName} onChange={(value) => updateRow("bankAccounts", index, "bankName", value)} /><TextField label="Account holder" value={row.accountHolder} onChange={(value) => updateRow("bankAccounts", index, "accountHolder", value)} /><label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={row.isPrimary === true} onChange={(event) => updateRows("bankAccounts", rows("bankAccounts").map((account, accountIndex) => ({ ...account, isPrimary: accountIndex === index ? event.target.checked : event.target.checked ? false : account.isPrimary })))} /> Primary account</label></div>}</Collection>}
        {active === "documents" && <Collection title="Documents" rows={rows("documents")} add={() => addRow("documents", { name: "", docType: "other" })} remove={(index) => removeRow("documents", index)}>{(row, index) => <div className="grid gap-4 sm:grid-cols-2"><TextField label="Document name" required value={row.name} onChange={(value) => updateRow("documents", index, "name", value)} /><TextField label="Type" value={row.docType} onChange={(value) => updateRow("documents", index, "docType", value)} /><TextField label="Document number" value={row.number} onChange={(value) => updateRow("documents", index, "number", value)} /><TextField label="File URL" value={row.fileUrl} onChange={(value) => updateRow("documents", index, "fileUrl", value)} /><TextField label="Expiry date" type="date" value={row.expiryDate} onChange={(value) => updateRow("documents", index, "expiryDate", value)} /></div>}</Collection>}
        {active === "official" && <div className="grid gap-4 sm:grid-cols-2"><OfficialLookupFields core={core} updateCore={updateCore} employeeId={id} /><LicenseFields core={core} updateCore={updateCore} /><EmploymentStatusField core={core} updateCore={updateCore} /></div>}
        <div className="flex justify-end gap-2 border-t border-edge pt-5"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save employee master</Button></div>
      </div>
    </form>}
  </Modal></EmployeeMasterLookupsContext.Provider>;
}

function Collection({ title, rows, add, remove, children }: { title: string; rows: Row[]; add: () => void; remove: (index: number) => void; children: (row: Row, index: number) => ReactNode }) {
  return <section className="space-y-4" aria-label={title}><div className="flex items-center justify-between gap-4"><div><h3 className="text-base font-semibold">{title}</h3><p className="text-sm text-muted-foreground">Add each record separately.</p></div><Button type="button" size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add</Button></div>{rows.length ? <div className="space-y-4">{rows.map((row, index) => <div key={String(row.id ?? index)} className="rounded-xl border border-edge bg-tint/20 p-4"><div className="mb-4 flex justify-between"><p className="text-sm font-medium">{title.slice(0, -1)} {index + 1}</p><Button type="button" size="sm" variant="ghost" onClick={() => remove(index)} aria-label={`Remove ${title.slice(0, -1).toLowerCase()} ${index + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>{children(row, index)}</div>)}</div> : <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-muted-foreground">No {title.toLowerCase()} added yet.</div>}</section>;
}

export function EmployeeMasterQuickEdit({ employee, canEditEmail, canEditMaster, ...lookups }: { employee: EmployeeForm & { id: string }; canEditEmail: boolean; canEditMaster: boolean } & EmployeeMasterLookups) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast(); const router = useRouter();
  async function quickSave(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget); try { const payload: Row = { firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone"), position: form.get("position"), joiningDate: form.get("joiningDate") || null }; if (canEditEmail) payload.email = form.get("email"); const response = await fetch(`/api/employees/${employee.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Could not update employee."); toast("success", "Employee updated"); setOpen(false); router.refresh(); } catch (error) { toast("error", error instanceof Error ? error.message : "Could not update employee."); } finally { setSaving(false); } }
  if (canEditMaster) return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit employee</Button>{open && <Editor id={employee.id} initial={employee} canEditEmail={canEditEmail} lookups={lookups} onClose={() => setOpen(false)} />}</>;
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit employee</Button><Modal open={open} onClose={() => setOpen(false)} title="Edit employee"><form onSubmit={quickSave} className="grid gap-4 sm:grid-cols-2"><EmployeeFields employee={employee} /><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div></form></Modal></>;
}

export function EmployeeMasterCreate({ branches, positions, requireBranch }: { branches: Array<{ id: string; name: string }>; positions: string[]; requireBranch: boolean }) {
  return <EmployeeMasterLookupsContext.Provider value={{ ...emptyLookups, branches, positions }}><EmployeeMasterCreateContent branches={branches} requireBranch={requireBranch} /></EmployeeMasterLookupsContext.Provider>;
}

function EmployeeMasterCreateContent({ branches, requireBranch }: { branches: Array<{ id: string; name: string }>; requireBranch: boolean }) {
  const [open, setOpen] = useState(false); const [created, setCreated] = useState<EmployeeForm | null>(null); const [editCreated, setEditCreated] = useState(false); const [saving, setSaving] = useState(false); const [accessOpen, setAccessOpen] = useState(false); const [accessLoading, setAccessLoading] = useState(false); const [accessSaving, setAccessSaving] = useState(false); const [accessAvailable, setAccessAvailable] = useState(false); const [accessDevices, setAccessDevices] = useState<Array<{ id: string; name: string; serialNumber: string }>>([]); const [accessMode, setAccessMode] = useState<"none" | "all" | "selected">("none"); const [accessSelected, setAccessSelected] = useState<string[]>([]); const [accessResults, setAccessResults] = useState<Array<{ deviceId: string; name: string; allowed: boolean; status: "sent" | "failed"; error?: string }>>([]); const toast = useToast(); const router = useRouter();
  const finishLater = () => { if (!created) return; const id = created.id; setCreated(null); setEditCreated(false); router.push(`/admin/employee-master?employee=${id}`); router.refresh(); };
  async function loadAccess(employee: EmployeeForm) { setAccessLoading(true); setAccessResults([]); try { const response = await fetch(`/api/employees/${employee.id}/device-access`); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Could not load biometric devices."); if (!data.accessAvailable || !data.devices?.length) { toast("success", "Employee created. Biometric setup is unavailable for this location, so no device policy was applied."); return; } setAccessDevices(data.devices); setAccessAvailable(true); setAccessOpen(true); } catch (error) { toast("error", error instanceof Error ? error.message : "Employee created, but biometric setup could not be loaded."); } finally { setAccessLoading(false); } }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget); try { const response = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNumber: form.get("employeeNumber"), deviceCode: form.get("deviceCode"), firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"), position: form.get("position"), joiningDate: form.get("joiningDate") || null, branchId: form.get("branchId") || null, password: form.get("password") }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Could not add employee."); const employee = { ...data.employee, joiningDate: dateValue(data.employee.joiningDate) }; setOpen(false); setCreated(employee); if (employee.deviceCode) void loadAccess(employee); else toast("success", "Employee created. Add a Device Code before configuring biometric access."); } catch (error) { toast("error", error instanceof Error ? error.message : "Could not add employee."); } finally { setSaving(false); } }
  async function saveAccess() { if (!created) return; setAccessSaving(true); try { const mode = accessMode === "all" ? "all" : "restricted"; const deviceIds = accessMode === "all" ? accessDevices.map((device) => device.id) : accessMode === "selected" ? accessSelected : []; const response = await fetch(`/api/employees/${created.id}/device-access`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, deviceIds }) }); const data = await response.json().catch(() => ({})); if (!response.ok && response.status !== 207) throw new Error(data.error ?? "Could not apply device access."); const results = data.results ?? []; setAccessResults(results); const failed = results.filter((result: { status: string }) => result.status === "failed"); toast(failed.length ? "error" : "success", failed.length ? `${failed.length} device command(s) failed. Retry after correcting the device or eBio connection.` : "Access commands were accepted by eBio. Confirm access physically on each machine."); } catch (error) { toast("error", error instanceof Error ? error.message : "Could not apply device access."); } finally { setAccessSaving(false); } }
  return <><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add employee</Button><Modal open={open} onClose={() => setOpen(false)} title="Add employee" description="Create the core record before completing the full master profile."><form onSubmit={create} className="grid gap-4 sm:grid-cols-2"><EmployeeFields employee={{ firstName: "", lastName: "", email: "", phone: "", position: "", joiningDate: "" }} includeCodes /><Field label="Initial password" hint="At least 12 characters. Share it securely with the employee."><Input name="password" type="password" required minLength={12} /></Field><Field label="Branch"><select name="branchId" required={requireBranch} className={inputClass}><option value="">{requireBranch ? "Select a branch" : "Unassigned"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><div className="col-span-full flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Create employee</Button></div></form></Modal>{accessLoading && <Modal open onClose={() => undefined} title="Checking biometric access"><div className="py-8 text-center text-sm text-muted-foreground">Checking active devices for this employee...</div></Modal>}{created && accessOpen && <Modal open onClose={() => setAccessOpen(false)} title="Configure biometric access" description="Choose an explicit policy. No access is the default; it does not grant all-device access."><div className="space-y-4"><p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">eBio supports only Block/Unblock by Device Code. It cannot create the employee or push their full name to a machine. Use this only after the employee is enrolled in eBio; a sent result means eBio accepted the access command, not that the user was provisioned or verified.</p><div className="space-y-2 rounded-xl border border-edge p-3"><label className="flex gap-3 text-sm"><input type="radio" checked={accessMode === "none"} onChange={() => setAccessMode("none")} /><span><strong>No access</strong><span className="block text-xs text-muted-foreground">Block this Device Code on every active device in scope.</span></span></label><label className="flex gap-3 text-sm"><input type="radio" checked={accessMode === "all"} onChange={() => setAccessMode("all")} /><span><strong>All active devices</strong></span></label><label className="flex gap-3 text-sm"><input type="radio" checked={accessMode === "selected"} onChange={() => setAccessMode("selected")} /><span><strong>Selected active devices</strong><span className="block text-xs text-muted-foreground">Unselected devices are blocked.</span></span></label></div>{accessMode === "selected" && <div className="max-h-52 divide-y divide-edge overflow-y-auto rounded-xl border border-edge">{accessDevices.map((device) => <label key={device.id} className="flex cursor-pointer gap-3 p-3 text-sm"><input type="checkbox" checked={accessSelected.includes(device.id)} onChange={() => setAccessSelected((current) => current.includes(device.id) ? current.filter((id) => id !== device.id) : [...current, device.id])} /><span>{device.name}<span className="block font-mono text-xs text-muted-foreground">{device.serialNumber}</span></span></label>)}</div>}{accessResults.length > 0 && <div className="rounded-xl border border-edge bg-tint/30 p-3 text-sm"><p className="font-medium">Per-device command results</p>{accessResults.map((result) => <p key={result.deviceId} className={result.status === "failed" ? "mt-1 text-destructive" : "mt-1 text-muted-foreground"}>{result.name}: {result.status}{result.error ? ` - ${result.error}` : ""}</p>)}</div>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAccessOpen(false)}>Finish later</Button><Button type="button" loading={accessSaving} disabled={!accessAvailable || (accessMode === "selected" && !accessSelected.length)} onClick={() => void saveAccess()}>{accessResults.some((result) => result.status === "failed") ? "Retry commands" : "Apply access policy"}</Button></div></div></Modal>}{created && !editCreated && !accessOpen && !accessLoading && <Modal open onClose={finishLater} title="Add employee details now?" description="The core employee record is saved. You can add address, profile, employment, bank, and document records now or finish later."><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={finishLater}>Finish later</Button><Button type="button" onClick={() => setEditCreated(true)}>Continue to Employee Master</Button></div></Modal>}{created && editCreated && <Editor id={String(created.id)} initial={created} canEditEmail onClose={finishLater} />}</>;
}
