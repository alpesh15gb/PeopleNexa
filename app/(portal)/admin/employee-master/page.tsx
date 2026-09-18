import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefcaseBusiness, Building2, CreditCard, FileText, GraduationCap, IdCard, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { formatDateIST } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { EmployeeMasterCreate, EmployeeMasterQuickEdit } from "./employee-master-quick-edit";
import { EmployeeDeviceAccess } from "./employee-device-access";

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
  const parts = ["flatHouseWingNumber", "streetLocalityArea", "landmark", "state", "country"]
    .map((key) => address[key] == null ? "" : String(address[key]).replace(/^Select\.\.\.\s*/i, "").trim())
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
  searchParams: Promise<{ employee?: string; q?: string; page?: string }>;
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
  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where = {
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
  const [total, employees, branches, departments, shifts, managers, positions, subdepartments] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: { id: true, employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, status: true, branch: { select: { name: true } } },
      orderBy: { employeeNumber: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...(locationId ? { locationId } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { tenantId: session.tenantId, loginOnly: false, status: "active", ...locationScope }, select: { id: true, firstName: true, lastName: true, employeeNumber: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    prisma.employee.findMany({ where: { tenantId: session.tenantId, loginOnly: false, position: { not: null }, ...locationScope }, distinct: ["position"], select: { position: true }, orderBy: { position: "asc" } }),
    prisma.employeeEmploymentProfile.findMany({ where: { subDepartment: { not: null }, employee: { tenantId: session.tenantId, loginOnly: false, ...locationScope } }, distinct: ["subDepartment"], select: { subDepartment: true }, orderBy: { subDepartment: "asc" } }),
  ]);
  const selectedId = params.employee ?? employees[0]?.id;
  const employee = selectedId
    ? await prisma.employee.findFirst({
        where: { id: selectedId, tenantId: session.tenantId, loginOnly: false, ...locationScope },
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
        },
      })
    : null;
  const source = isAdmin && employee?.legacyImportData && typeof employee.legacyImportData === "object" && !Array.isArray(employee.legacyImportData)
    ? employee.legacyImportData as Record<string, unknown>
    : {};
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const listHref = (nextPage: number) => `/admin/employee-master?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(nextPage) })}`;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Employee Master"
        description={isAdmin ? "Complete employee records, biometric identity, employment data, and imported HR master fields." : "Employee records for your assigned location."}
        actions={isAdmin || isLocationManager ? <div className="flex flex-wrap gap-2"><EmployeeMasterCreate branches={branches} requireBranch={isLocationManager} /><Link href="/api/reports/master-data" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Download master data</Link></div> : undefined}
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
            <CardDescription>{total} employee{total === 1 ? "" : "s"} in the master</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action="/admin/employee-master" className="flex gap-2">
              <input name="q" defaultValue={query} placeholder="Name, code, device ID" className="min-w-0 flex-1 rounded-lg border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40" />
              <button className="rounded-lg border border-edge px-3 text-sm font-medium hover:bg-tint" type="submit">Find</button>
            </form>
            <div className="max-h-[60vh] divide-y divide-edge overflow-y-auto rounded-xl border border-edge">
              {employees.map((item) => (
                <Link key={item.id} href={`/admin/employee-master?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page), employee: item.id })}`} className={`block px-3 py-3 transition-colors hover:bg-tint ${item.id === employee?.id ? "bg-primary/[0.08]" : ""}`}>
                  <p className="truncate text-sm font-semibold">{item.firstName} {item.lastName}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{item.employeeNumber} · {item.deviceCode ?? "No device ID"}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.branch?.name ?? "Unassigned"} · {item.position ?? "No designation"}</p>
                </Link>
              ))}
              {!employees.length && <p className="p-5 text-center text-sm text-muted-foreground">No employees found.</p>}
            </div>
            {pageCount > 1 && <div className="flex items-center justify-between text-xs"><Link href={listHref(Math.max(1, page - 1))} aria-disabled={page === 1} className={page === 1 ? "pointer-events-none text-muted-foreground/50" : "font-medium text-primary"}>Previous</Link><span className="text-muted-foreground">Page {page} of {pageCount}</span><Link href={listHref(Math.min(pageCount, page + 1))} aria-disabled={page === pageCount} className={page === pageCount ? "pointer-events-none text-muted-foreground/50" : "font-medium text-primary"}>Next</Link></div>}
          </CardContent>
        </Card>

        {!employee ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Select an employee to view the master record.</CardContent></Card> : (
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
                  <div className="flex flex-wrap gap-2"><EmployeeDeviceAccess employeeId={employee.id} /><EmployeeMasterQuickEdit canEditEmail={isAdmin || isLocationManager || isBranchManager} canEditMaster={isAdmin || isLocationManager || isBranchManager} branches={branches} departments={departments} shifts={shifts} managers={managers} positions={positions.flatMap((row) => row.position ? [row.position] : [])} subdepartments={subdepartments.flatMap((row) => row.subDepartment ? [row.subDepartment] : [])} employee={{ id: employee.id, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, phone: employee.phone, position: employee.position, joiningDate: employee.joiningDate ? formatDateIST(employee.joiningDate) : "", drivingLicenseNumber: employee.drivingLicenseNumber, drivingLicenseType: employee.drivingLicenseType, drivingLicenseExpiresAt: employee.drivingLicenseExpiresAt ? formatDateIST(employee.drivingLicenseExpiresAt) : "" }} /></div>
                </div>
              </CardContent>
            </Card>

            <section className="grid gap-6 2xl:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary" /> Official details</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Division / branch", value: employee.branch?.name ?? "—" }, { label: "Department", value: employee.department?.name ?? "—" }, { label: "Shift", value: employee.shift?.name ?? "—" }, { label: "Reporting manager", value: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName} (${employee.manager.employeeNumber})` : "—" }, { label: "Joining date", value: formatDateIST(employee.joiningDate) }, { label: "Sub department", value: employee.employmentProfile?.subDepartment ?? "—" }, { label: "Grade", value: employee.employmentProfile?.grade ?? "—" }, ...(isAdmin ? [{ label: "Pay mode", value: employee.payMode }, { label: "Monthly gross", value: employee.salary == null ? "—" : `₹${employee.salary}` }, { label: "CTC", value: employee.employmentProfile?.ctc == null ? "—" : `₹${employee.employmentProfile.ctc}` }, ...sourceFields(source, "OFF_")] : [])]}/></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Personal details</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Email", value: employee.profile?.personalEmail ?? employee.email }, { label: "Phone", value: employee.phone ?? "—" }, { label: "Gender", value: employee.profile?.gender ?? "—" }, { label: "Date of birth", value: formatDateIST(employee.profile?.actualDateOfBirth ?? employee.profile?.dateOfBirthCertificate) }, { label: "Marital status", value: employee.profile?.maritalStatus ?? "—" }, { label: "Current address", value: employee.profile?.currentAddress }, { label: "Permanent address", value: employee.profile?.permanentAddress }, { label: "Emergency contact name", value: employee.profile?.emergencyContactName ?? "—" }, { label: "Emergency contact number", value: employee.profile?.emergencyContactNumber ?? "—" }, ...(isAdmin ? [...sourceFields(source, "PER_"), ...sourceFields(source, "RPT_").filter((field) => !/Biometric ID|Division|Department|Designation|Joining Date|Ctc|Gross Salary|Status/.test(field.label))] : [])]}/></CardContent></Card>
              {isAdmin && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Bank and statutory</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Bank name", value: employee.bankName ?? "—" }, { label: "Account number", value: employee.accountNumber ?? "—" }, { label: "IFSC", value: employee.ifscCode ?? "—" }, { label: "PAN", value: employee.pan ?? "—" }, { label: "UAN", value: employee.uan ?? "—" }, ...sourceFields(source, "BANK_")]}/></CardContent></Card>}
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Bank accounts</CardTitle></CardHeader><CardContent>{employee.bankAccounts.length ? <div className="space-y-3">{employee.bankAccounts.map((account) => <div key={account.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{account.bankName ?? "Bank account"}{account.isPrimary ? " · Primary" : ""}</p><DetailGrid fields={[{ label: "Account holder", value: account.accountHolder ?? "—" }, { label: "Account number", value: account.accountNumber }, { label: "IFSC", value: account.ifscCode ?? "—" }, { label: "Branch", value: account.bankBranch ?? "—" }, { label: "Type", value: account.accountType ?? "—" }]}/></div>)}</div> : <p className="text-sm text-muted-foreground">No bank accounts available.</p>}</CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><IdCard className="h-4 w-4 text-primary" /> Identity documents</CardTitle></CardHeader><CardContent><DetailGrid fields={[{ label: "Aadhaar number", value: employee.aadhaarNumber ?? "—" }, { label: "Driving license", value: employee.drivingLicenseNumber ?? "—" }, { label: "License type", value: employee.drivingLicenseType ?? "—" }, { label: "License expiry", value: formatDateIST(employee.drivingLicenseExpiresAt) }, ...(isAdmin ? sourceFields(source, "ID_") : [])]}/></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Employee documents</CardTitle></CardHeader><CardContent>{employee.documents.length ? <div className="space-y-3">{employee.documents.map((document) => <div key={document.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{document.name}</p><div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><p>Type: {document.docType}</p><p>Number: {document.number ?? "—"}</p><p>Issue: {formatDateIST(document.issuedDate)}</p><p>Expiry: {formatDateIST(document.expiryDate)}</p></div>{document.fileUrl && <a href={document.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Open file</a>}</div>)}</div> : <p className="text-sm text-muted-foreground">No documents available.</p>}</CardContent></Card>
            </section>

            <section className="grid gap-6 2xl:grid-cols-2">
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Education</CardTitle></CardHeader><CardContent>{employee.education.length ? <div className="space-y-3">{employee.education.map((entry) => <div key={entry.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{entry.qualification}{entry.specialization ? ` · ${entry.specialization}` : ""}</p><p className="mt-1 text-sm text-muted-foreground">{entry.institution}{entry.board ? ` · ${entry.board}` : ""}{entry.completionYear ? ` · ${entry.completionYear}` : ""}</p></div>)}</div> : <DetailGrid fields={sourceFields(source, "EDU_")}/>}</CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Work experience</CardTitle></CardHeader><CardContent>{employee.workExperience.length ? <div className="space-y-3">{employee.workExperience.map((entry) => <div key={entry.id} className="rounded-xl border border-edge bg-tint/30 p-3"><p className="font-medium">{entry.employer} · {entry.jobTitle}</p><p className="mt-1 text-sm text-muted-foreground">{formatDateIST(entry.startDate)} to {entry.isCurrent ? "Present" : formatDateIST(entry.endDate)}{entry.location ? ` · ${entry.location}` : ""}</p></div>)}</div> : <DetailGrid fields={sourceFields(source, "WRK_")}/>}</CardContent></Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
