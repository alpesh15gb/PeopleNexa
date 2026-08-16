import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { RostersPanel } from "./rosters-panel";

export const dynamic = "force-dynamic";

export default async function AdminRostersPage() {
  const session = await requireSession();
  const [employees, shifts, departments] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.shift.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, startTime: true, endTime: true, isNightShift: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.department.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Shift Rosters"
        description="Assign shifts by employee or department for any date range — the roster drives auto punch-out and shift-wise reports"
      />
      <Card>
        <CardContent className="p-0">
          <RostersPanel employees={employees} shifts={shifts} departments={departments} />
        </CardContent>
      </Card>
    </div>
  );
}
