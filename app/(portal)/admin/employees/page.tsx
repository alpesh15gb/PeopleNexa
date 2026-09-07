import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { EmployeesTable } from "./employees-table";
import { BranchPicker } from "../attendance/branch-picker";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const session = await requireSession();
  const { branch: branchParam } = await searchParams;

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";

  // Branch filter must belong to this tenant; unknown ids are ignored.
  const branchFilter = isBranchManager
    ? (ownBranchId ? { id: ownBranchId, name: ownBranchName } : null)
    : branchParam
      ? await prisma.branch.findFirst({ where: { id: branchParam, tenantId: session.tenantId }, select: { id: true, name: true } })
      : null;
  const branchId = isBranchManager ? ownBranchId : (branchFilter?.id ?? null);

  const [employees, branches, departments, shifts, tenant, totalCount] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, ...(branchId ? { branchId } : {}) },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        position: true,
        salary: true,
        joiningDate: true,
        bankName: true,
        accountNumber: true,
        ifscCode: true,
        pan: true,
        uan: true,
        payMode: true,
        workBasisRate: true,
        managerId: true,
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { seats: true, plan: true } }),
    prisma.employee.count({ where: { tenantId: session.tenantId } }),
  ]);

  const seatsUsed = totalCount;
  const seatsTotal = tenant?.seats ?? seatsUsed;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Employees"
        description={
          branchId
            ? `${employees.length} people in ${branchFilter?.name ?? "this branch"}`
            : `${employees.length} people in your company`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isBranchManager ? (
              <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
                Branch: {ownBranchName}
              </span>
            ) : (
              <BranchPicker branches={branches} value={branchId ?? ""} basePath="/admin/employees" />
            )}
            <span
              className={`rounded-xl border px-3 py-1.5 text-[12px] font-medium ${
                seatsUsed >= seatsTotal
                  ? "border-rose-400/20 bg-rose-500/10 text-rose-300"
                  : "border-edge bg-tint text-muted-foreground"
              }`}
            >
              {seatsUsed} / {seatsTotal} seats used{seatsUsed >= seatsTotal && " — upgrade needed"}
            </span>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <EmptyState
              title={branchId ? "No employees in this branch" : "No employees yet"}
              description={branchId ? "Try another branch." : "Add your first employee to start tracking attendance."}
            />
          ) : (
            <EmployeesTable employees={employees} branches={branches} departments={departments} shifts={shifts} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
