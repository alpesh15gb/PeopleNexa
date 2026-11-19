import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { LoansPanel } from "./loans-panel";

export const dynamic = "force-dynamic";

export default async function AdminLoansPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Loans & Advances" description="Ask a workspace administrator to assign a location to your account." />;
  }
  const employeeScope = locationId ? employeeLocationScope(locationId) : {};

  const [loans, employees] = await Promise.all([
    prisma.employeeLoan.findMany({
      where: { tenantId: session.tenantId, employee: employeeScope },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "active", loginOnly: false, ...employeeScope },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
      orderBy: { employeeNumber: "asc" },
    }),
  ]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Loans & Advances" description="Advances and loans are deducted automatically from monthly payslips" />
      <Card>
        <CardContent className="p-0">
          <LoansPanel loans={loans} employees={employees} canManageExisting={session.role === "admin"} />
        </CardContent>
      </Card>
    </div>
  );
}
