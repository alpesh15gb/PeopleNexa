import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { isDateKey } from "@/lib/dates";
import { getTenantAccess } from "@/lib/modules-server";
import { workspaceRegion } from "@/lib/workspace-region";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ReportControls } from "./report-controls";
import { DeviceTables } from "./device-tables";
import Link from "next/link";
import { Download } from "lucide-react";
import { inactiveEmployeeReportSelect, inactiveEmployeeReportWhere } from "@/lib/inactive-employee-report";
import { ReportLibrary } from "./report-library";
import { WorkforceMovement } from "./workforce-movement";
import { EmptyState } from "@/components/ui/stat";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The only five reports: eBioserver-style Daily + Monthly, Status Matrix,
// Work Hours Summary, and Monthly Performance (Excel + print each).
const KNOWN_TYPES = new Set([
  "device-daily",
  "device-monthly",
  "device-status-matrix",
  "device-work-summary",
  "device-performance",
  "inactive-employees",
  "workforce-movement",
]);

const DEVICE_KIND_BY_TYPE: Record<string, "daily" | "monthly" | "status-matrix" | "work-summary" | "performance"> = {
  "device-daily": "daily",
  "device-monthly": "monthly",
  "device-status-matrix": "status-matrix",
  "device-work-summary": "work-summary",
  "device-performance": "performance",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; departmentId?: string; date?: string; month?: string; branchId?: string; q?: string }>;
}) {
  const session = await requireActiveSession();
  if (!["admin", "location_manager", "branch_manager"].includes(session.role)) redirect("/employee");
  const [params, access, tenant, manager] = await Promise.all([
    searchParams,
    getTenantAccess(session.tenantId),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    session.role === "admin" ? null : prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true, locationId: true },
    }),
  ]);
  const forcedBranchId = session.role === "branch_manager" ? (manager?.branchId ?? null) : null;
  const forcedLocationId = session.role === "location_manager" ? (manager?.locationId ?? null) : null;
  if ((session.role === "branch_manager" && !forcedBranchId) || (session.role === "location_manager" && !forcedLocationId)) {
    return <EmptyState title="Workspace assignment needed" description="Ask your administrator to assign your branch or location." />;
  }
  const canReadAttendance = access.modules.has("attendance");
  const canReadPeople = access.modules.has("employees");
  const canReadPayroll = session.role !== "branch_manager" && access.modules.has("payroll");
  const requestedType = params.type ?? ((params.date || params.month || params.branchId || params.departmentId) ? "device-daily" : "");
  const type = KNOWN_TYPES.has(requestedType) ? requestedType : "";
  const isPeopleReport = type === "inactive-employees" || type === "workforce-movement";
  if (!type || (isPeopleReport ? !canReadPeople : !canReadAttendance)) {
    return <ReportLibrary attendance={canReadAttendance} people={canReadPeople && !forcedBranchId} payroll={canReadPayroll} />;
  }
  const region = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  const month = params.month && /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(params.month) && params.month < "9999-12" ? params.month : today.slice(0, 7);
  if (type === "workforce-movement") {
    if (forcedBranchId) redirect("/admin/reports");
    return <WorkforceMovement tenantId={session.tenantId} locationId={forcedLocationId} month={month} locale={region.locale} showExits={access.modules.has("exit")} />;
  }

  const branches = await prisma.branch.findMany({
    where: { tenantId: session.tenantId, ...(forcedBranchId ? { id: forcedBranchId } : {}), ...(forcedLocationId ? { locationId: forcedLocationId } : {}) },
    select: { id: true, name: true, locationId: true },
    orderBy: { name: "asc" },
  });

  const departments = await prisma.department.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
  });
  const visibleBranches = branches;
  const date = params.date && isDateKey(params.date) ? params.date : today;
  const deviceBranchId = forcedBranchId ?? (forcedLocationId && !visibleBranches.some((branch) => branch.id === params.branchId) ? "" : params.branchId ?? "");
  const deviceDepartmentId = params.departmentId ?? "";
  const kind = DEVICE_KIND_BY_TYPE[type];
  const inactiveEmployees = type === "inactive-employees" ? await prisma.employee.findMany({
    where: inactiveEmployeeReportWhere({ tenantId: session.tenantId, role: session.role, manager, branchId: params.branchId, departmentId: params.departmentId, query: params.q }),
    select: inactiveEmployeeReportSelect,
    orderBy: { employeeNumber: "asc" },
  }) : null;
  const qs = new URLSearchParams({ kind });
  if (kind === "daily") qs.set("date", date);
  else qs.set("month", month);
  if (deviceBranchId) qs.set("branchId", deviceBranchId);
  if (deviceDepartmentId) qs.set("departmentId", deviceDepartmentId);
  const apiUrl = `/api/reports/device?${qs.toString()}`;
  const inactiveExportParams = new URLSearchParams();
  if (params.branchId) inactiveExportParams.set("branchId", params.branchId);
  if (params.departmentId) inactiveExportParams.set("departmentId", params.departmentId);
  if (params.q?.trim()) inactiveExportParams.set("q", params.q.trim());

  return (
    <div className="animate-fade-up space-y-6">
      <Link href="/admin/reports" className="inline-flex text-sm font-medium text-primary hover:underline">Report library</Link>
      <PageHeader
        title="Reports"
        description="Attendance reports with Excel and print"
        actions={
          <div className="flex flex-wrap gap-2">
            {session.role === "admin" && (
              <a href="/api/reports/master-data" className="inline-flex items-center gap-2 rounded-lg border border-edge bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-tint">
                <Download className="h-4 w-4" aria-hidden="true" /> Download master data
              </a>
            )}
            <Link href="/admin/reports/punch-details" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Punch Details / Logs</Link>
          </div>
        }
      />
      <Card>
        <CardContent className="p-5">
          <ReportControls
            type={type}
            showAttendance={canReadAttendance}
            showPeople={canReadPeople}
            departments={departments}
            branches={visibleBranches}
            effectiveDate={date}
            effectiveMonth={month}
            effectiveBranchId={deviceBranchId}
            effectiveDepartmentId={deviceDepartmentId}
          />
        </CardContent>
      </Card>
      {inactiveEmployees && <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/admin/reports" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="type" value="inactive-employees" />
          {params.branchId && <input type="hidden" name="branchId" value={params.branchId} />}
          {params.departmentId && <input type="hidden" name="departmentId" value={params.departmentId} />}
          <input key={params.q ?? ""} type="search" name="q" defaultValue={params.q ?? ""} aria-label="Search inactive employees" placeholder="Name, employee code or device code" className="h-11 w-full rounded-lg border border-edge bg-card px-3 text-sm sm:w-80" />
          <button type="submit" className="h-11 rounded-lg border border-edge px-4 text-sm font-medium hover:bg-tint">Search</button>
          <span className="text-sm text-muted-foreground">{inactiveEmployees.length} inactive employee{inactiveEmployees.length === 1 ? "" : "s"}</span>
        </form>
        <a href={`/api/reports/inactive-employees?${inactiveExportParams}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Download aria-hidden="true" className="h-4 w-4" /> Export Excel</a>
        {(session.role === "admin" || session.role === "location_manager") && <a href={`/api/reports/master-data?status=inactive&${inactiveExportParams}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-edge bg-card px-4 text-sm font-medium hover:bg-tint"><Download aria-hidden="true" className="h-4 w-4" /> Export all details</a>}
      </div>}
      {/* key remounts per URL: without it a kind switch renders one frame with
          the previous kind's data shape (e.g. daily {rows} into a monthly
          table expecting {blocks}) and crashes before the refetch clears it. */}
      {inactiveEmployees ? <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead><tr className="border-b border-edge text-muted-foreground"><th className="p-4">Employee Code</th><th className="p-4">Device Code</th><th className="p-4">Employee</th><th className="p-4">Designation</th><th className="p-4">Department</th><th className="p-4">Branch</th></tr></thead><tbody>{inactiveEmployees.map((employee) => <tr key={employee.employeeNumber} className="border-b border-edge"><td className="p-4 font-mono">{employee.employeeNumber}</td><td className="p-4 font-mono">{employee.deviceCode ?? "—"}</td><td className="p-4 font-medium">{employee.firstName} {employee.lastName}</td><td className="p-4">{employee.position ?? "—"}</td><td className="p-4">{employee.department?.name ?? "—"}</td><td className="p-4">{employee.branch?.name ?? "—"}</td></tr>)}{inactiveEmployees.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No inactive employees match these filters.</td></tr>}</tbody></table></CardContent></Card> : <DeviceTables key={apiUrl} kind={kind} apiUrl={apiUrl} xlsxUrl={`${apiUrl}&format=xlsx`} />}
    </div>
  );
}
