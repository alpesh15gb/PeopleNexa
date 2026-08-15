import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { EmployeesTable } from "./employees-table";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const session = await requireSession();
  const [employees, branches, departments, shifts] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId },
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
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.branch.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
    prisma.shift.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Employees"
        description={`${employees.length} people in your company`}
      />
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <EmptyState
              title="No employees yet"
              description="Add your first employee to start tracking attendance."
            />
          ) : (
            <EmployeesTable employees={employees} branches={branches} departments={departments} shifts={shifts} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
