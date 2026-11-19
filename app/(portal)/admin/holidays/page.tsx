import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { HolidaysManager } from "./holidays-manager";
import Link from "next/link";
import { dateKeyInTimeZone } from "@/lib/workspace-time";
import { workspaceRegion } from "@/lib/workspace-region";

export const dynamic = "force-dynamic";

export default async function AdminHolidaysPage() {
  const session = await requireActiveSession();
  const [tenant, holidays] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } }),
    prisma.holiday.findMany({ where: { tenantId: session.tenantId }, orderBy: { date: "asc" } }),
  ]);

  const region = workspaceRegion(tenant?.config);
  const today = dateKeyInTimeZone(new Date(), region.timeZone);
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Holiday calendar" description="Company holidays shared by attendance and leave." actions={<Link href="/admin/leaves?view=calendar" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Team leave calendar</Link>} />
      <Card>
        <CardContent className="p-0">
          <HolidaysManager holidays={holidays} region={region} today={today} canManage={session.role === "admin"} />
        </CardContent>
      </Card>
    </div>
  );
}
