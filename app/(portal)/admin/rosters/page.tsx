import Link from "next/link";
import { redirect } from "next/navigation";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { isDateKey } from "@/lib/dates";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { workspaceRegion } from "@/lib/workspace-region";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { RostersPanel } from "./rosters-panel";

export const dynamic = "force-dynamic";

export default async function AdminRostersPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const session = await requireActiveSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/admin/attendance");
  const location = session.role === "location_manager" ? await managerLocationId(session) : null;
  const scope = session.role === "location_manager" ? employeeLocationScope(location ?? "__unassigned__") : {};
  const [employees, shifts, tenant, params] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...scope },
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
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    searchParams,
  ]);
  const today = dateKeyInTimeZone(new Date(), workspaceRegion(tenant?.config).timeZone);
  const week = typeof params.week === "string" && isDateKey(params.week) ? params.week : today;
  const departments = [...new Map(employees.flatMap(({ department }) => department ? [[department.id, department] as const] : [])).values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Shift roster"
        description="Plan weekly work schedules and assign shifts to employees or departments."
        actions={<Link href="/admin/attendance?view=setup" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Attendance setup</Link>}
      />
      <Card>
        <CardContent className="p-0">
          <RostersPanel employees={employees} shifts={shifts} departments={departments} weekKey={week} today={today} />
        </CardContent>
      </Card>
    </div>
  );
}
