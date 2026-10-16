import { Suspense } from "react";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefcaseBusiness, Building2, CreditCard, FileText, GraduationCap, IdCard, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { formatDateIST, toDateKey } from "@/lib/dates";
import { maskAadhaar, maskPan } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { EmployeeMasterCreate, EmployeeMasterQuickEdit } from "./employee-master-quick-edit";
import { EmployeeDeviceAccess } from "./employee-device-access";
import { EmployeeTransfer } from "./employee-transfer";
import { EmployeeStatusAction } from "./employee-status-action";
import { EmployeeMasterImportExport } from "./employee-master-import-export";
import { EmployeeMasterList } from "./employee-master-list";
import { shouldShowSpouseDetails } from "@/lib/employee-spouse";
import { loadEmployeeMasterList } from "@/lib/employee-master-list";

export const dynamic = "force-dynamic";

type Field = { label: string; value: unknown };

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return value; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return String(parsed);
  const address = parsed as Record<string, unknown>;
  const addressLine = address.addressLine ?? address.line1 ?? [address.flatHouseWingNumber, address.streetLocalityArea].filter((part) => part != null && String(part).trim()).join(", ");
  const parts = [addressLine, address.landmark, address.city ?? address.district ?? address.town, address.state, address.postalCode ?? address.pinCode ?? address.pincode ?? address.zipCode, address.country]
    .map((part) => part == null ? "" : String(part).replace(/^Select\.\.\.\s*/i, "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function sourceValue(source: Record<string, unknown>, key: string) {
  return displayValue(source[key]);
}

function sourceFields(source: Record<string, unknown>, prefix: string): Field[] {
  return Object.entries(source)
    .filter(([key, value]) => key.startsWith(prefix) && value != null && String(value).trim() !== "")
    .map(([key, value]) => ({ label: key.slice(prefix.length).replace(/_/g, " "), value }));
}

function DetailGrid({ fields }: { fields: Field[] }) {
  const visible = fields.filter((field) => field.value != null && field.value !== "");
  if (!visible.length) return <p className="text-sm text-muted-foreground">No data available.</p>;
  return (
    <dl className="space-y-0">
      {visible.map((field) => (
        <div key={field.label} className="grid grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.25fr)] gap-4 border-b border-edge py-2.5 text-sm">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
          <dd className="min-w-0 break-words font-medium text-foreground">{displayValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function EmployeeMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; q?: string; page?: string; status?: string }>;
}) {
  const session = await requireActiveSession();
  const isAdmin = session.role === "admin";
  const isLocationManager = session.role === "location_manager";
  const isBranchManager = session.role === "branch_manager";
  if (!isAdmin && !isLocationManager && !isBranchManager) redirect("/admin");
  const locationId = isLocationManager
    ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId
    : null;
  const branchId = isBranchManager ? (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true } }))?.branchId : null;
  const locationScope = isLocationManager ? { branch: { locationId: locationId ?? "__unassigned_location__" } } : isBranchManager ? { branchId: branchId ?? "__unassigned_branch__" } : {};
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = params.status === "active" || params.status === "inactive" || params.status === "assignment_pending" ? params.status : "all";
  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const baseWhere = {
    tenantId: session.tenantId,
    loginOnly: false,
    ...locationScope,
    ...(query ? {
      OR: [
        { firstName: { contains: query, mode: "insensitive" as const } },
        { lastName: { contains: query, mode: "insensitive" as const } },
        { employeeNumber: { contains: query, mode: "insensitive" as const } },
        { deviceCode: { contains: query, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [list, branches, positions] = await Promise.all([
    loadEmployeeMasterList(baseWhere, status, page),
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...(isLocationManager ? { locationId: locationId ?? "__unassigned_location__" } : isBranchManager ? { id: branchId ?? "__unassigned_branch__" } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.designation.findMany({ where: { tenantId: session.tenantId, active: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const { total, employees, counts, where } = list;
  const selectedId = params.employee ?? employees[0]?.id;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (page > pageCount) redirect(`/admin/employee-master?${new URLSearchParams({ ...(query ? { q: query } : {}), status, page: String(pageCount) })}`);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Employee Master"
        description={isAdmin ? "Complete employee records, biometric identity, employment data, and imported HR master fields." : "Employee records for your assigned location."}
        actions={isAdmin || isLocationManager ? <div className="flex flex-wrap gap-2">{isAdmin && <EmployeeMasterImportExport />}<EmployeeMasterCreate branches={branches} positions={positions.map(row => row.name)} requireBranch={isLocationManager} /><Link href="/api/reports/master-data" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Download master data</Link></div> : undefined}
      />
      {isLocationManager && !locationId && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Your Location Manager account has no location assigned. Ask an administrator to assign your location before viewing Employee Master.
          </CardContent>
        </Card>
      )}
      {isBranchManager && !branchId && <Card><CardContent className="p-6 text-sm text-muted-foreground">Your Branch Manager account has no branch assigned. Ask an administrator to assign your branch before viewing Employee Master.</CardContent></Card>}
      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>Employees</CardTitle>
            <CardDescription>{total} {status === "all" ? "" : `${status} `}employee{total === 1 ? "" : "s"}{query ? " matching your search" : " in the master"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action="/admin/employee-master" className="flex gap-2">
              <input type="hidden" name="status" value={status} />
              <input name="q" defaultValue={query} placeholder="Name, code, device ID" className="min-w-0 flex-1 rounded-lg border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40" />
              <button className="rounded-lg border border-edge px-3 text-sm font-medium hover:bg-tint" type="submit">Find</button>
            </form>
            <EmployeeMasterList key={`${query}:${status}:${page}`} employees={employees} selectedId={selectedId} query={query} status={status} page={page} pageCount={pageCount} counts={counts} canChangeStatus={isAdmin || isLocationManager} actorId={session.sub} />
          </CardContent>
        </Card>

        <Suspense key={`${status}:${selectedId ?? "empty"}`} fallback={<Card><CardContent className="p-10 text-sm text-muted-foreground" role="status">Loading employee details…</CardContent></Card>}>
          <EmployeeMasterDetails selectedId={selectedId} where={where} isAdmin={isAdmin} isLocationManager={isLocationManager} isBranchManager={isBranchManager} />
        </Suspense>
      </div>
    </div>
  );
}

async function EmployeeMasterDetails({ selectedId, where, isAdmin, isLocationManager, isBranchManager }: {
  selectedId?: string; where: Prisma.EmployeeWhereInput; isAdmin: boolean; isLocationManager: boolean; isBranchManager: boolean;
}) {
  const employee = selectedId
    ? await prisma.employee.findFirst({
        where: { id: selectedId, ...where },
        include: {
          branch: true,
          department: true,
          shift: true,
          manager: { select: { firstName: true, lastName: true, employeeNumber: true } },
          education: { orderBy: { completionYear: "desc" } },
          workExperience: { orderBy: { startDate: "desc" } },
          documents: { orderBy: { createdAt: "desc" } },
           profile: true,
            employmentProfile: true,
            bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
            transfers: { where: { status: "scheduled" }, orderBy: { effectiveDate: "asc" }, take: 1 },
        },
      })
    : null;
  const source = isAdmin && employee?.legacyImportData && typeof employee.legacyImportData === "object" && !Array.isArray(employee.legacyImportData)
    ? employee.legacyImportData as Record<string, unknown>
    : {};
  const scheduledTransfer = employee?.transfers[0];
  const destinationBranch = scheduledTransfer ? await prisma.branch.findFirst({ where: { id: scheduledTransfer.destinationBranchId, tenantId: employee!.tenantId }, select: { name: true } }) : null;
  return <>        {!employee ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Select an employee to view the master record.</CardContent></Card> : (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start gap-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-xl font-bold text-white">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{employee.firstName} {employee.lastName}</h2><Badge tone={employee.status === "active" ? "success" : "neutral"}>{employee.status}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{employee.position ?? "No designation"} · {employee.branch?.name ?? "No branch assigned"}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-tint px-2.5 py-1 font-mono">Employee: {employee.employeeNumber}</span><span className="rounded-md bg-tint px-2.5 py-1 font-mono">Device: {employee.deviceCode ?? "—"}</span><span className="rounded-md bg-tint px-2.5 py-1">Joined: {formatDateIST(employee.joiningDate)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2"><EmployeeDeviceAccess employeeId={employee.id} />{(isAdmin || isLocationManager) && <><EmployeeStatusAction employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`} status={employee.status} /><EmployeeTransfer employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`} branches={[]} departments={[]} shifts={[]} managers={[]} scheduled={scheduledTransfer ? { id: scheduledTransfer.id, effectiveDate: scheduledTransfer.effectiveDate.toISOString(), destinationBranchName: destinationBranch?.name ?? "selected branch" } : null} /></>}<EmployeeMasterQuickEdit canEditEmail={isAdmin || isLocationManager || isBranchManager} canEditMaster={isAdmin || isLocationManager || isBranchManager} canEditPan={isAdmin || isLocationManager} branches={[]} departments={[]} shifts={[]} managers={[]} positions={[]} subdepartments={[]} subdepartmentsByDepartment={{}} employee={{ id: employee.id, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, phone: employee.phone, position: employee.position, status: employee.status, joiningDate: employee.joiningDate ? toDateKey(employee.joiningDate) : "", profilePicture: employee.profilePicture, aadhaarNumber: employee.aadhaarNumber, pan: employee.pan, drivingLicenseNumber: employee.drivingLicenseNumber, drivingLicenseClassification: employee.drivingLicenseClassification, drivingLicenseType: employee.drivingLicenseType, drivingLicenseExpiresAt: employee.drivingLicenseExpiresAt ? toDateKey(employee.drivingLicenseExpiresAt) : "" }} /></div>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 2xl:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary" /> Official details</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Division / branch", value: employee.branch?.name ?? "—" }, { label: "Department", value: employee.department?.name ?? "—" }, { label: "Shift", value: employee.shift?.name ?? "—" }, { label: "Reporting manager", value: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName} (${employee.manager.employeeNumber})` : "—" }, { label: "Joining date", value: formatDateIST(employee.joiningDate) }, { label: "Sub department", value: employee.employmentProfile?.subDepartment ?? "—" }, { label: "Grade", value: employee.employmentProfile?.grade ?? "—" }, ...(isAdmin ? [{ label: "Pay mode", value: employee.payMode }, { label: "Monthly gross", value: employee.salary == null ? "—" : `₹${employee.salary}` }, { label: "CTC", value: employee.employmentProfile?.ctc == null ? "—" : `₹${employee.employmentProfile.ctc}` }, ...sourceFields(source, "OFF_")] : [])]}/></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Personal details</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Email", value: employee.profile?.personalEmail ?? employee.email }, { label: "Phone", value: employee.phone ?? "—" }, { label: "Gender", value: employee.profile?.gender ?? "—" }, { label: "Date of birth", value: formatDateIST(employee.profile?.actualDateOfBirth ?? employee.profile?.dateOfBirthCertificate) }, { label: "Marital status", value: employee.profile?.maritalStatus ?? "—" }, ...(shouldShowSpouseDetails(employee.profile?.maritalStatus) ? [{ label: "Spouse name", value: employee.profile?.spouseName ?? "—" }, { label: "Spouse contact number", value: employee.profile?.spouseContactNumber ?? "—" }] : []), { label: "Current address", value: employee.profile?.currentAddress }, { label: "Permanent address", value: employee.profile?.permanentAddress }, { label: "Emergency contact name", value: employee.profile?.emergencyContactName ?? "—" }, { label: "Emergency contact number", value: employee.profile?.emergencyContactNumber ?? "—" }, ...(isAdmin ? [...sourceFields(source, "PER_"), ...sourceFields(source, "RPT_").filter((field) => !/Biometric ID|Division|Department|Designation|Joining Date|Ctc|Gross Salary|Status/.test(field.label))] : [])]}/></CardContent></Card>
              {isAdmin && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Bank and statutory</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Bank name", value: employee.bankName ?? "—" }, { label: "Account number", value: employee.accountNumber ?? "—" }, { label: "IFSC", value: employee.ifscCode ?? "—" }, { label: "PAN", value: maskPan(employee.pan) }, { label: "UAN", value: employee.uan ?? "—" }, { label: "ESI / IP number", value: employee.esiIpNumber ?? "—" }, ...sourceFields(source, "BANK_")]}/></CardContent></Card>}
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Bank accounts</CardTitle></CardHeader><CardContent>{employee.bankAccounts.length ? <div className="space-y-3">{employee.bankAccounts.map((account) => <div key={account.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{account.bankName ?? "Bank account"}{account.isPrimary ? " · Primary" : ""}</p><DetailGrid fields={[{ label: "Account holder", value: account.accountHolder ?? "—" }, { label: "Account number", value: account.accountNumber }, { label: "IFSC", value: account.ifscCode ?? "—" }, { label: "Branch", value: account.bankBranch ?? "—" }, { label: "Type", value: account.accountType ?? "—" }]}/></div>)}</div> : <p className="text-sm text-muted-foreground">No bank accounts available.</p>}</CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><IdCard className="h-4 w-4 text-primary" /> Identity documents</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Aadhaar number", value: maskAadhaar(employee.aadhaarNumber) }, { label: "Driving license", value: employee.drivingLicenseNumber ?? "—" }, { label: "License classification", value: employee.drivingLicenseClassification?.replace("_", "-") ?? "—" }, { label: "License type", value: employee.drivingLicenseType ?? "—" }, { label: "License expiry", value: formatDateIST(employee.drivingLicenseExpiresAt) }, ...(isAdmin ? sourceFields(source, "ID_") : [])]}/></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Employee documents</CardTitle></CardHeader><CardContent>{employee.documents.length ? <div className="space-y-3">{employee.documents.map((document) => <div key={document.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{document.name}</p><div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><p>Type: {document.docType}</p><p>Number: {document.number ?? "—"}</p><p>Issue: {formatDateIST(document.issuedDate)}</p><p>Expiry: {formatDateIST(document.expiryDate)}</p></div>{document.fileUrl && <a href={document.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Open file</a>}</div>)}</div> : <p className="text-sm text-muted-foreground">No documents available.</p>}</CardContent></Card>
            </section>

            <section className="grid gap-6 2xl:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Education</CardTitle></CardHeader><CardContent>{employee.education.length ? <div className="space-y-3">{employee.education.map((entry) => <div key={entry.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{entry.qualification}{entry.specialization ? ` · ${entry.specialization}` : ""}</p><p className="mt-1 text-sm text-muted-foreground">{entry.institution}{entry.board ? ` · ${entry.board}` : ""}{entry.completionYear ? ` · ${entry.completionYear}` : ""}</p></div>)}</div> : <DetailGrid fields={sourceFields(source, "EDU_")}/>}</CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Work experience</CardTitle></CardHeader><CardContent>{employee.workExperience.length ? <div className="space-y-3">{employee.workExperience.map((entry) => <div key={entry.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{entry.employer} · {entry.jobTitle}</p><p className="mt-1 text-sm text-muted-foreground">{formatDateIST(entry.startDate)} to {entry.isCurrent ? "Present" : formatDateIST(entry.endDate)}{entry.location ? ` · ${entry.location}` : ""}</p></div>)}</div> : <DetailGrid fields={sourceFields(source, "WRK_")}/>}</CardContent></Card>
            </section>
          </div>
        )}</>;
}
