import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { OrgChartTree } from "./org-chart-tree";

export const dynamic = "force-dynamic";

export default async function AdminOrgChartPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin") redirect("/admin");
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "active", loginOnly: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      role: true,
      managerId: true,
      department: { select: { name: true } },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const ids = new Set(employees.map((employee) => employee.id));
  const unlinked = employees.filter((employee) => !employee.managerId || !ids.has(employee.managerId)).length;
  const deptCount = new Set(employees.map((e) => e.department?.name).filter(Boolean)).size;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Org Chart"
        description="Who reports to whom — set the manager on each employee profile to shape this tree"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold">{employees.length}</p>
            <p className="text-[12px] text-muted-foreground">Active employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold">{deptCount}</p>
            <p className="text-[12px] text-muted-foreground">Departments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-display text-2xl font-bold">{unlinked}</p>
            <p className="text-[12px] text-muted-foreground">Top-level (no manager)</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <OrgChartTree employees={employees} />
        </CardContent>
      </Card>
    </div>
  );
}
