import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { HolidaysManager } from "./holidays-manager";

export const dynamic = "force-dynamic";

export default async function AdminHolidaysPage() {
  const session = await requireSession();
  const holidays = await prisma.holiday.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { date: "asc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Holidays" description="Company-wide days off" />
      <Card>
        <CardContent className="p-0">
          <HolidaysManager holidays={holidays} />
        </CardContent>
      </Card>
    </div>
  );
}
