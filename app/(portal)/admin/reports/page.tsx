import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { istDateKey } from "@/lib/ist";
import { monthKeyIST } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ReportControls } from "./report-controls";
import { DeviceTables } from "./device-tables";
import Link from "next/link";
import { Download } from "lucide-react";

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
  searchParams: Promise<{ type?: string; departmentId?: string; date?: string; month?: string; branchId?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const type = KNOWN_TYPES.has(params.type ?? "") ? params.type! : "device-daily";

  const branches = await prisma.branch.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, locationId: true },
    orderBy: { name: "asc" },
  });

  const [departments, manager] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
    }),
    session.role === "branch_manager" || session.role === "location_manager"
      ? prisma.employee.findFirst({
          where: { id: session.sub, tenantId: session.tenantId },
          select: { branchId: true, locationId: true },
        })
      : Promise.resolve(null),
  ]);
  const forcedBranchId = session.role === "branch_manager" ? (manager?.branchId ?? null) : null;
  const forcedLocationId = session.role === "location_manager" ? (manager?.locationId ?? null) : null;
  const visibleBranches = forcedBranchId ? branches.filter((b) => b.id === forcedBranchId) : forcedLocationId ? branches.filter((b) => b.locationId === forcedLocationId) : branches;
  const todayIST = istDateKey(new Date());
  const date = params.date || todayIST;
  const month = params.month || monthKeyIST(new Date());
  const deviceBranchId = forcedBranchId ?? (forcedLocationId && !visibleBranches.some((branch) => branch.id === params.branchId) ? "" : params.branchId ?? "");
  const deviceDepartmentId = params.departmentId ?? "";
  const kind = DEVICE_KIND_BY_TYPE[type];
  const inactiveEmployees = type === "inactive-employees" ? await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "inactive", ...(forcedBranchId ? { branchId: forcedBranchId } : forcedLocationId ? { branch: { locationId: forcedLocationId } } : {}), ...(params.branchId ? { branchId: params.branchId } : {}), ...(params.departmentId ? { departmentId: params.departmentId } : {}) },
    select: { employeeNumber: true, deviceCode: true, firstName: true, lastName: true, position: true, joiningDate: true, branch: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: { employeeNumber: "asc" },
  }) : null;
  const qs = new URLSearchParams({ kind });
  if (kind === "daily") qs.set("date", date);
  else qs.set("month", month);
  if (deviceBranchId) qs.set("branchId", deviceBranchId);
  if (deviceDepartmentId) qs.set("departmentId", deviceDepartmentId);
  const apiUrl = `/api/reports/device?${qs.toString()}`;

  return (
    <div className="animate-fade-up space-y-6">
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
            <Link href="/admin/reports/punch-details" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Punch Details</Link>
          </div>
        }
      />
      <Card>
        <CardContent className="p-5">
          <ReportControls
            type={type}
            departments={departments}
            branches={visibleBranches}
            effectiveDate={date}
            effectiveMonth={month}
            effectiveBranchId={deviceBranchId}
            effectiveDepartmentId={deviceDepartmentId}
          />
        </CardContent>
      </Card>
      {/* key remounts per URL: without it a kind switch renders one frame with
          the previous kind's data shape (e.g. daily {rows} into a monthly
          table expecting {blocks}) and crashes before the refetch clears it. */}
      {inactiveEmployees ? <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead><tr className="border-b border-edge text-muted-foreground"><th className="p-4">Employee Code</th><th className="p-4">Device Code</th><th className="p-4">Employee</th><th className="p-4">Designation</th><th className="p-4">Department</th><th className="p-4">Branch</th></tr></thead><tbody>{inactiveEmployees.map((employee) => <tr key={employee.employeeNumber} className="border-b border-edge"><td className="p-4 font-mono">{employee.employeeNumber}</td><td className="p-4 font-mono">{employee.deviceCode ?? "—"}</td><td className="p-4 font-medium">{employee.firstName} {employee.lastName}</td><td className="p-4">{employee.position ?? "—"}</td><td className="p-4">{employee.department?.name ?? "—"}</td><td className="p-4">{employee.branch?.name ?? "—"}</td></tr>)}{inactiveEmployees.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No inactive employees match these filters.</td></tr>}</tbody></table></CardContent></Card> : <DeviceTables key={apiUrl} kind={kind} apiUrl={apiUrl} xlsxUrl={`${apiUrl}&format=xlsx`} />}
    </div>
  );
}
