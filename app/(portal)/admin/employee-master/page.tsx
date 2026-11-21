import { Suspense } from "react";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { dayRangeIST, formatDateIST, toDateKey, isMonthKey } from "@/lib/dates";
import { maskAadhaar, maskPan } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { EmployeeMasterCreate, EmployeeMasterQuickEdit } from "./employee-master-quick-edit";
import { EmployeeDeviceAccess } from "./employee-device-access";
import { EmployeeTransfer } from "./employee-transfer";
import { EmployeeStatusAction } from "./employee-status-action";
import { EmployeeMasterImportExport } from "./employee-master-import-export";
import { EmployeeMasterList } from "./employee-master-list";
import { EmployeeSignIn } from "./employee-sign-in";
import { shouldShowSpouseDetails } from "@/lib/employee-spouse";
import { employeeLocationScope } from "@/lib/location-scope";
import { loadEmployeeMasterList } from "@/lib/employee-master-list";
import { ylrWorkbookImportEnabled } from "@/lib/employee-legacy-import";
import { getTenantAccess } from "@/lib/modules-server";
import { formatRegionalMoney, workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { leaveAwaitingReview } from "@/lib/leave-lifecycle";

export const dynamic = "force-dynamic";

type Field = { label: string; value: unknown };
type DirectoryParams = Partial<Record<"employee" | "section" | "payLocation" | "payPage" | "payPeriod" | "q" | "page" | "status" | "department" | "branch", string | string[]>>;

function maskedNumber(value: string | null | undefined) {
  return value ? `•••• ${value.trim().slice(-4)}` : "—";
}

function filterValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim().slice(0, 150) : "";
}

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
  searchParams: Promise<DirectoryParams>;
}) {
  const session = await requireActiveSession();
  const isAdmin = session.role === "admin";
  const isLocationManager = session.role === "location_manager";
  const isBranchManager = session.role === "branch_manager";
  if (!isAdmin && !isLocationManager && !isBranchManager) redirect("/admin");
  const [params, access, manager, tenant] = await Promise.all([
    searchParams,
    getTenantAccess(session.tenantId),
    isAdmin ? null : prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true, branchId: true } }),
    isAdmin ? prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }) : null,
  ]);
  if (!access.modules.has("employees")) redirect("/admin");
  const locationId = manager?.locationId;
  const branchId = manager?.branchId;
  const showDevices = access.modules.has("devices");
  const scope: Prisma.EmployeeWhereInput = {
    tenantId: session.tenantId,
    loginOnly: false,
    ...(isLocationManager ? employeeLocationScope(locationId ?? "__unassigned_location__") : isBranchManager ? { branchId: branchId ?? "__unassigned_branch__" } : {}),
  };
  const query = filterValue(params.q);
  const department = filterValue(params.department);
  const branch = filterValue(params.branch);
  const requestedEmployee = filterValue(params.employee);
  const status = params.status === "active" || params.status === "inactive" || (showDevices && params.status === "assignment_pending") ? params.status : "all";
  const pageSize = 50;
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(filterValue(params.page), 10) || 1));
  const filters = Object.fromEntries(Object.entries({ q: query, department, branch }).filter(([, value]) => value));
  if (requestedEmployee) {
    const directory = new URLSearchParams({ ...filters, status, page: String(page) });
    const payPeriod = filterValue(params.payPeriod);
    const payLocation = filterValue(params.payLocation);
    const payrollReturn = (isAdmin || isLocationManager) && isMonthKey(payPeriod) && payLocation
      ? new URLSearchParams({ period: payPeriod, location: payLocation, view: "missing-salaries", page: filterValue(params.payPage) || "1" })
      : null;
    const detailParams = new URLSearchParams(directory);
    detailParams.set("employee", requestedEmployee);
    if (payrollReturn) {
      detailParams.set("payPeriod", payPeriod);
      detailParams.set("payLocation", payLocation);
      detailParams.set("payPage", filterValue(params.payPage) || "1");
    }
    return <div id="employee-record" className="space-y-5">
      <Link href={payrollReturn ? `/admin/payroll?${payrollReturn}` : `/admin/employee-master?${directory}`} className="inline-flex min-h-10 items-center font-medium text-primary hover:underline">← {payrollReturn ? "Back to payroll salary checks" : "Back to employee directory"}</Link>
      <Suspense key={`${requestedEmployee}:${filterValue(params.section)}`} fallback={<p role="status">Loading employee details…</p>}>
        <EmployeeMasterDetails selectedId={requestedEmployee} where={scope} tenantId={session.tenantId} isAdmin={isAdmin} isLocationManager={isLocationManager} isBranchManager={isBranchManager} showDevices={showDevices} modules={access.modules} requestedSection={filterValue(params.section)} detailQuery={detailParams.toString()} managerLocation={locationId ?? null} />
      </Suspense>
    </div>;
  }
  const baseWhere: Prisma.EmployeeWhereInput = {
    AND: [
      scope,
      ...(department ? [{ departmentId: department }] : []),
      ...(branch ? [{ branchId: branch }] : []),
      ...(query ? query.split(/\s+/).map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { employeeNumber: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
          ...(showDevices ? [{ deviceCode: { contains: term, mode: "insensitive" as const } }] : []),
        ],
      })) : []),
    ],
  };
  const [list, branches, departments, positions] = await Promise.all([
    loadEmployeeMasterList(baseWhere, status, page, showDevices),
    prisma.branch.findMany({ where: { tenantId: session.tenantId, ...(isLocationManager ? { locationId: locationId ?? "__unassigned_location__" } : isBranchManager ? { id: branchId ?? "__unassigned_branch__" } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId, ...(isBranchManager ? { employees: { some: scope } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    isBranchManager ? [] : prisma.designation.findMany({ where: { tenantId: session.tenantId, active: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const { total, employees, counts } = list;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (page > pageCount) redirect(`/admin/employee-master?${new URLSearchParams({ ...filters, status, page: String(pageCount) })}`);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Employee directory"
        description={isAdmin ? "Find employees and manage their employment records." : `Employee records for your assigned ${isLocationManager ? "location" : "branch"}.`}
        actions={isAdmin || (isLocationManager && locationId) ? <div className="flex flex-wrap items-center gap-2">
          <EmployeeMasterCreate branches={branches} departments={departments} positions={positions.map(row => row.name)} requireBranch={isLocationManager} showDevices={showDevices} />
          {isAdmin && <EmployeeMasterImportExport legacyWorkbookEnabled={ylrWorkbookImportEnabled(tenant?.config)} />}
          {access.modules.has("reports") && <Link href="/api/reports/master-data" className="rounded-lg border border-edge px-3 py-2 text-sm font-medium hover:bg-tint">Download detailed records</Link>}
        </div> : undefined}
      />
      {isLocationManager && !locationId && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Your Location Manager account has no location assigned. Ask an administrator to assign your location before viewing the employee directory.
          </CardContent>
        </Card>
      )}
      {isBranchManager && !branchId && <Card><CardContent className="p-6 text-sm text-muted-foreground">Your Branch Manager account has no branch assigned. Ask an administrator to assign your branch before viewing the employee directory.</CardContent></Card>}
      <Card>
        <CardHeader className="flex-col gap-0">
          <CardTitle>Employees</CardTitle>
          <CardDescription>{total} employee{total === 1 ? "" : "s"}{query || department || branch ? " matching your filters" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/employee-master" className="grid items-end gap-2 lg:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="status" value={status} />
            <input name="q" aria-label="Search employees" defaultValue={query} placeholder="Name, employee code or email" maxLength={150} className="w-full rounded-lg border border-edge bg-card px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/40" />
            <div className="grid grid-cols-2 gap-2">
              <select name="department" aria-label="Department" defaultValue={department} className="min-w-0 rounded-lg border border-edge bg-card px-2 py-2 text-sm">
                <option value="">All departments</option>
                {departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
              <select name="branch" aria-label="Branch" defaultValue={branch} className="min-w-0 rounded-lg border border-edge bg-card px-2 py-2 text-sm">
                <option value="">All branches</option>
                {branches.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-lg border border-edge px-3 py-2 text-sm font-medium hover:bg-tint" type="submit">Apply filters</button>
              {Object.keys(filters).length > 0 && <Link className="text-sm text-primary hover:underline" href={`/admin/employee-master?${new URLSearchParams({ status })}`}>Clear filters</Link>}
            </div>
          </form>
          <EmployeeMasterList key={`${query}:${department}:${branch}:${status}:${page}`} employees={employees} filters={filters} status={status} page={page} pageCount={pageCount} counts={counts} canChangeStatus={isAdmin || isLocationManager} actorId={session.sub} showDevices={showDevices} />
        </CardContent>
      </Card>
    </div>
  );
}

async function EmployeeMasterDetails({ selectedId, where, tenantId, isAdmin, isLocationManager, isBranchManager, showDevices, modules, requestedSection, detailQuery, managerLocation }: {
  selectedId: string; where: Prisma.EmployeeWhereInput; tenantId: string; isAdmin: boolean; isLocationManager: boolean; isBranchManager: boolean; showDevices: boolean; modules: ReadonlySet<string>; requestedSection: string; detailQuery: string; managerLocation: string | null;
}) {
  const sections = [
    { id: "overview", label: "Overview" }, { id: "job", label: isAdmin || isLocationManager ? "Job and compensation" : "Job" },
    ...(modules.has("attendance") || modules.has("leaves") ? [{ id: "time", label: "Attendance and leave" }] : []),
    { id: "documents", label: "Documents and identity" },
    ...(modules.has("assets") && (isAdmin || isLocationManager) ? [{ id: "assets", label: "Assets" }] : []),
    { id: "timeline", label: "Timeline" },
  ];
  const active = sections.find((section) => section.id === requestedSection) ?? sections[0];
  const employee = selectedId
    ? await prisma.employee.findFirst({
        where: { id: selectedId, ...where },
        include: {
          branch: { include: { location: { select: { name: true } } } },
          department: true,
          shift: true,
          location: { select: { name: true } },
          tenant: { select: { config: true } },
          manager: { select: { firstName: true, lastName: true, employeeNumber: true } },
          education: { orderBy: { completionYear: "desc" } },
          workExperience: { orderBy: { startDate: "desc" } },
          documents: active.id === "documents" && modules.has("documents") ? { where: { tenantId }, select: { id: true, name: true, docType: true, expiryDate: true, fileUrl: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 } : false,
           profile: true,
            employmentProfile: true,
            bankAccounts: active.id === "job" && !isBranchManager ? { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } : false,
            transfers: { where: { status: "scheduled" }, orderBy: { effectiveDate: "asc" }, take: 1 },
        },
      })
    : null;
  if (!employee) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">This employee record is unavailable. Return to the directory to choose another employee.</CardContent></Card>;
  const region = workspaceRegion(employee.tenant.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const scope = { tenantId: employee.tenantId, employeeId: employee.id };
  const [attendance, leave, assets, history, tasks] = await Promise.all([
    active.id === "time" && modules.has("attendance") ? prisma.attendance.groupBy({ where: { ...scope, date: { gte: dayRangeIST(`${today.slice(0, 7)}-01`).start, lt: dayRangeIST(today).end } }, by: ["status"], _count: { _all: true } }) : [],
    active.id === "time" && modules.has("leaves") ? prisma.leaveRequest.count({ where: { ...scope, ...leaveAwaitingReview } }) : null,
    active.id === "assets" ? prisma.assetAssignment.findMany({ where: { employeeId: employee.id, asset: { tenantId: employee.tenantId, ...(managerLocation ? { locationId: managerLocation } : {}) } }, select: { id: true, assignedAt: true, returnedAt: true, asset: { select: { name: true, tag: true } } }, orderBy: [{ assignedAt: "desc" }, { id: "desc" }], take: 12 }) : [],
    active.id === "timeline" && isAdmin ? prisma.auditLog.findMany({ where: { tenantId: employee.tenantId, entity: "Employee", entityId: employee.id }, select: { id: true, action: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 }) : [],
    active.id === "overview" && modules.has("onboarding") && !isBranchManager ? prisma.onboardingTask.groupBy({ where: scope, by: ["status"], _count: { _all: true } }) : [],
  ]);
  const taskCount = tasks.reduce((count, row) => count + row._count._all, 0);
  const done = tasks.find((row) => row.status === "done")?._count._all ?? 0;
  const canViewFiles = isAdmin || isLocationManager;
  const source = active.id === "timeline" && isAdmin && employee.legacyImportData && typeof employee.legacyImportData === "object" && !Array.isArray(employee.legacyImportData)
    ? employee.legacyImportData as Record<string, unknown>
    : {};
  const importGroups = [
    { label: "Employment", fields: sourceFields(source, "OFF_") },
    { label: "Personal", fields: sourceFields(source, "PER_") },
    { label: "Reporting", fields: sourceFields(source, "RPT_") },
    { label: "Bank", fields: sourceFields(source, "BANK_") },
    { label: "Identification", fields: sourceFields(source, "ID_") },
    { label: "Education", fields: sourceFields(source, "EDU_") },
    { label: "Work history", fields: sourceFields(source, "WRK_") },
  ].filter((group) => group.fields.length > 0);
  const canManageEmployee = isAdmin || !["admin", "branch_manager", "location_manager"].includes(employee.role);
  const scheduledTransfer = employee.transfers[0];
  const destinationBranch = scheduledTransfer ? await prisma.branch.findFirst({ where: { id: scheduledTransfer.destinationBranchId, tenantId: employee.tenantId }, select: { name: true } }) : null;
  return <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start gap-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-xl font-bold text-white">{(employee.firstName[0] ?? "") + (employee.lastName[0] ?? "")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold">{employee.firstName} {employee.lastName}</h1><Badge tone={employee.status === "active" ? "success" : "neutral"}>{employee.status}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{[employee.position ?? "No designation", employee.department?.name, employee.branch ? employee.branch.location?.name : employee.location?.name, employee.branch?.name].filter(Boolean).join(" · ")}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-tint px-2.5 py-1 font-mono">Employee: {employee.employeeNumber}</span>{showDevices && employee.deviceCode && <span className="rounded-md bg-tint px-2.5 py-1 font-mono">Device: {employee.deviceCode}</span>}<span className="rounded-md bg-tint px-2.5 py-1">Joined: {formatDateIST(employee.joiningDate)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">{canManageEmployee && <EmployeeMasterQuickEdit canEditEmail canEditMaster canEditPan={isAdmin || isLocationManager} branches={[]} departments={[]} shifts={[]} managers={[]} positions={[]} subdepartments={[]} subdepartmentsByDepartment={{}} employee={{ id: employee.id, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, phone: employee.phone, position: employee.position, status: employee.status, joiningDate: employee.joiningDate ? toDateKey(employee.joiningDate) : "", profilePicture: employee.profilePicture }} />}
                    {isAdmin && employee.role === "employee" && employee.status === "active" && employee.branchId && <EmployeeSignIn employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`} />}
                    {canManageEmployee && showDevices && employee.deviceCode && (isAdmin || isLocationManager) && <EmployeeDeviceAccess employeeId={employee.id} />}{canManageEmployee && (isAdmin || isLocationManager) && <><EmployeeStatusAction employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`} status={employee.status} showDeviceNotice={showDevices && Boolean(employee.deviceCode)} />{(employee.status === "active" || scheduledTransfer) && <EmployeeTransfer employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`} branches={[]} departments={[]} shifts={[]} managers={[]} scheduled={scheduledTransfer ? { id: scheduledTransfer.id, effectiveDate: scheduledTransfer.effectiveDate.toISOString(), destinationBranchName: destinationBranch?.name ?? "selected branch" } : null} />}</>}</div>
                </div>
              </CardContent>
            </Card>


            <nav aria-label="Employee record sections" className="flex flex-wrap gap-2 border-b border-edge pb-2">
              {sections.map((section) => {
                const query = new URLSearchParams(detailQuery);
                if (section.id !== "overview") query.set("section", section.id);
                return <Link key={section.id} href={`/admin/employee-master?${query}`} scroll={false} aria-current={active.id === section.id ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ${active.id === section.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-tint hover:text-foreground"}`}>{section.label}</Link>;
              })}
            </nav>

            {active.id === "overview" && <section className="grid gap-4 lg:grid-cols-2" aria-label="Employee overview">
              <Card><CardHeader><CardTitle>Reporting and work</CardTitle></CardHeader><CardContent><DetailGrid fields={[
                { label: "Department", value: employee.department?.name }, { label: "Branch", value: employee.branch?.name },
                { label: "Location", value: employee.branch ? employee.branch.location?.name : employee.location?.name },
                { label: "Reporting manager", value: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : "Unassigned" },
                { label: "Shift", value: employee.shift?.name }, { label: "Joined", value: formatDateIST(employee.joiningDate) },
              ]} /></CardContent></Card>
              <Card><CardHeader><CardTitle>Contact and personal details</CardTitle></CardHeader><CardContent><DetailGrid fields={[
                { label: "Email", value: employee.profile?.personalEmail ?? employee.email }, { label: "Phone", value: employee.phone },
                { label: "Gender", value: employee.profile?.gender }, { label: "Date of birth", value: formatDateIST(employee.profile?.actualDateOfBirth ?? employee.profile?.dateOfBirthCertificate) },
                { label: "Marital status", value: employee.profile?.maritalStatus },
                ...(shouldShowSpouseDetails(employee.profile?.maritalStatus) ? [{ label: "Spouse name", value: employee.profile?.spouseName }, { label: "Spouse contact", value: employee.profile?.spouseContactNumber }] : []),
                { label: "Current address", value: employee.profile?.currentAddress }, { label: "Permanent address", value: employee.profile?.permanentAddress },
                { label: "Emergency contact", value: employee.profile?.emergencyContactName }, { label: "Emergency phone", value: employee.profile?.emergencyContactNumber },
              ]} /></CardContent></Card>
              {modules.has("onboarding") && !isBranchManager && <Card><CardHeader><CardTitle>Onboarding checklist</CardTitle></CardHeader><CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{taskCount ? `${done} of ${taskCount} tasks complete` : "No checklist assigned."}</p>
                {employee.status === "active" && <Link href={`/admin/onboarding?employee=${encodeURIComponent(employee.id)}${taskCount ? "" : "&action=assign"}`} className="text-sm font-medium text-primary hover:underline">{taskCount ? "Review checklist" : "Assign checklist"}</Link>}
                {employee.status !== "active" && taskCount > 0 && <Link href={`/admin/onboarding?employee=${encodeURIComponent(employee.id)}`} className="text-sm font-medium text-primary hover:underline">Open checklist history</Link>}
              </CardContent></Card>}
            </section>}

            {active.id === "job" && <section className="grid gap-4 lg:grid-cols-2" aria-label="Employment and work history">
              <Card><CardHeader><CardTitle>Employment</CardTitle></CardHeader><CardContent><DetailGrid fields={[
                { label: "Designation", value: employee.position }, { label: "Subdepartment", value: employee.employmentProfile?.subDepartment },
                { label: "Grade", value: employee.employmentProfile?.grade }, { label: "Pay group", value: !isBranchManager ? employee.employmentProfile?.salaryGroup : null },
                ...(isAdmin ? [
                  { label: "Pay mode", value: employee.payMode },
                  { label: "Monthly gross", value: employee.salary == null ? null : formatRegionalMoney(employee.salary, region) },
                  { label: "CTC", value: employee.employmentProfile?.ctc == null ? null : formatRegionalMoney(employee.employmentProfile.ctc, region) },
                ] : []),
              ]} /></CardContent></Card>
              {!isBranchManager && <Card><CardHeader><CardTitle>Banking and statutory</CardTitle></CardHeader><CardContent className="space-y-4">
                {isAdmin && <DetailGrid fields={[{ label: "Bank name", value: employee.bankName }, { label: "Account number", value: maskedNumber(employee.accountNumber) }, { label: "IFSC", value: employee.ifscCode }, { label: "PAN", value: maskPan(employee.pan) }, { label: "UAN", value: maskedNumber(employee.uan) }, { label: "ESI number", value: maskedNumber(employee.esiIpNumber) }]} />}
                {employee.bankAccounts.length ? <ul className="space-y-3">{employee.bankAccounts.map((account) => <li key={account.id} className="rounded-lg border border-edge p-3"><p className="text-sm font-medium">{account.bankName ?? "Bank account"} {account.isPrimary && <Badge tone="neutral">Primary</Badge>}</p><DetailGrid fields={[{ label: "Account holder", value: account.accountHolder }, { label: "Account number", value: maskedNumber(account.accountNumber) }, { label: "Branch", value: account.bankBranch }, { label: "Type", value: account.accountType }]} /></li>)}</ul> : <p className="text-sm text-muted-foreground">No additional bank accounts recorded.</p>}
              </CardContent></Card>}
              <Card><CardHeader><CardTitle>Education</CardTitle></CardHeader><CardContent>{employee.education.length ? <ul className="space-y-3">{employee.education.map((entry) => <li key={entry.id}><p className="font-medium">{entry.qualification}{entry.specialization ? ` · ${entry.specialization}` : ""}</p><p className="text-sm text-muted-foreground">{[entry.institution, entry.board, entry.completionYear].filter(Boolean).join(" · ")}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No education records yet.</p>}</CardContent></Card>
              <Card><CardHeader><CardTitle>Work experience</CardTitle></CardHeader><CardContent>{employee.workExperience.length ? <ul className="space-y-3">{employee.workExperience.map((entry) => <li key={entry.id}><p className="font-medium">{entry.employer} · {entry.jobTitle}</p><p className="text-sm text-muted-foreground">{formatDateIST(entry.startDate)} to {entry.isCurrent ? "Present" : formatDateIST(entry.endDate)}{entry.location ? ` · ${entry.location}` : ""}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No work history yet.</p>}</CardContent></Card>
            </section>}

            {active.id === "time" && <section className="grid gap-4 lg:grid-cols-2" aria-label="Attendance and leave">
              {modules.has("attendance") && <Card><CardHeader><CardTitle>Attendance this month</CardTitle></CardHeader><CardContent>{attendance.length ? <DetailGrid fields={attendance.map(({ status, _count }) => ({ label: status.replace(/_/g, " "), value: _count._all }))} /> : <p className="text-sm text-muted-foreground">No recorded attendance this month.</p>}</CardContent></Card>}
              {leave !== null && <Card><CardHeader><CardTitle>Leave and cancellations</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{leave}</p><p className="text-sm text-muted-foreground">Awaiting review</p></CardContent></Card>}
            </section>}

            {active.id === "documents" && <section className="grid gap-4 lg:grid-cols-2" aria-label="Documents and identity">
              <Card><CardHeader><CardTitle>Identity details</CardTitle></CardHeader><CardContent><DetailGrid fields={[
                { label: "Aadhaar", value: maskAadhaar(employee.aadhaarNumber) }, { label: "Driving license", value: maskedNumber(employee.drivingLicenseNumber) },
                { label: "License classification", value: employee.drivingLicenseClassification?.replace("_", " ") }, { label: "License type", value: employee.drivingLicenseType },
                { label: "License expiry", value: formatDateIST(employee.drivingLicenseExpiresAt) },
              ]} /></CardContent></Card>
              {modules.has("documents") && <Card><CardHeader><CardTitle>Employee files</CardTitle></CardHeader><CardContent className="space-y-3">
                {employee.documents.length ? <ul className="divide-y divide-edge">{employee.documents.map((document) => <li key={document.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <div><p className="text-sm font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.docType}{document.expiryDate && ` · Expires ${formatDateIST(document.expiryDate)}`}</p></div>
                  {document.fileUrl && canViewFiles && <a href={`/api/documents/${encodeURIComponent(document.id)}/attachment`} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Open attachment</a>}
                </li>)}</ul> : <p className="text-sm text-muted-foreground">No files on this record.</p>}
                {canViewFiles && <Link href={`/admin/documents?q=${encodeURIComponent(employee.employeeNumber)}`} className="text-sm font-medium text-primary hover:underline">Open document register</Link>}
                {canViewFiles && <p className="text-sm text-muted-foreground">Review uploaded files through your existing HR verification process and record the outcome there.</p>}
              </CardContent></Card>}
            </section>}

            {active.id === "assets" && <Card><CardHeader><CardTitle>Recent asset assignments</CardTitle></CardHeader><CardContent>
              {assets.length ? <ul className="divide-y divide-edge">{assets.map((assignment) => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{assignment.asset.name}</p><p className="text-xs text-muted-foreground">{assignment.asset.tag} · Assigned {formatDateIST(assignment.assignedAt)}</p></div><Badge tone={assignment.returnedAt ? "neutral" : "info"}>{assignment.returnedAt ? `Returned ${formatDateIST(assignment.returnedAt)}` : "Assigned"}</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No asset assignments in your scope.</p>}
            </CardContent></Card>}

            {active.id === "timeline" && <section className="space-y-4" aria-label="Employee timeline">
              <Card><CardHeader><CardTitle>Employment milestones</CardTitle></CardHeader><CardContent><DetailGrid fields={[
                { label: "Record created", value: formatDateIST(employee.createdAt) },
                { label: "Joining date", value: formatDateIST(employee.joiningDate) },
                { label: "Scheduled transfer", value: scheduledTransfer ? `${destinationBranch?.name ?? "Destination branch"} · ${formatDateIST(scheduledTransfer.effectiveDate)}` : null },
              ]} /></CardContent></Card>
              {isAdmin && <Card><CardHeader><CardTitle>Recent employee audit events</CardTitle></CardHeader><CardContent>{history.length ? <ul className="divide-y divide-edge">{history.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="capitalize">{event.action.replace(/[._]/g, " ")}</span><time dateTime={event.createdAt.toISOString()} className="text-muted-foreground">{formatDateIST(event.createdAt)}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">No employee audit events recorded.</p>}</CardContent></Card>}
              {importGroups.length > 0 && <details className="rounded-xl border border-edge bg-card p-4"><summary className="cursor-pointer font-medium">Historical import fields</summary><div className="mt-4 grid gap-6 lg:grid-cols-2">{importGroups.map((group) => <div key={group.label}><h3 className="text-sm font-semibold">{group.label}</h3><DetailGrid fields={group.fields} /></div>)}</div></details>}
            </section>}
          </div>;
}
