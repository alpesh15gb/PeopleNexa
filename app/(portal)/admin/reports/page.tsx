import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { istDateKey } from "@/lib/ist";
import { monthKeyIST } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ReportControls } from "./report-controls";
import { DeviceTables } from "./device-tables";

export const dynamic = "force-dynamic";

// The only five reports: eBioserver-style Daily + Monthly, Status Matrix,
// Work Hours Summary, and Monthly Performance (Excel + print each).
const KNOWN_TYPES = new Set([
  "device-daily",
  "device-monthly",
  "device-status-matrix",
  "device-work-summary",
  "device-performance",
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
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const [departments, manager] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
    }),
    session.role === "branch_manager"
      ? prisma.employee.findFirst({
          where: { id: session.sub, tenantId: session.tenantId },
          select: { branchId: true },
        })
      : Promise.resolve(null),
  ]);
  const forcedBranchId = session.role === "branch_manager" ? (manager?.branchId ?? null) : null;
  const visibleBranches = forcedBranchId ? branches.filter((b) => b.id === forcedBranchId) : branches;
  const todayIST = istDateKey(new Date());
  const date = params.date || todayIST;
  const month = params.month || monthKeyIST(new Date());
  const deviceBranchId = forcedBranchId ?? params.branchId ?? "";
  const deviceDepartmentId = params.departmentId ?? "";
  const kind = DEVICE_KIND_BY_TYPE[type];
  const qs = new URLSearchParams({ kind });
  if (kind === "daily") qs.set("date", date);
  else qs.set("month", month);
  if (deviceBranchId) qs.set("branchId", deviceBranchId);
  if (deviceDepartmentId) qs.set("departmentId", deviceDepartmentId);
  const apiUrl = `/api/reports/device?${qs.toString()}`;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Reports" description="Attendance reports with Excel and print" />
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
      <DeviceTables key={apiUrl} kind={kind} apiUrl={apiUrl} xlsxUrl={`${apiUrl}&format=xlsx`} />
    </div>
  );
}
