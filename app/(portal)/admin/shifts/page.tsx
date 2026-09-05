import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { ShiftsManager } from "./shifts-manager";

export const dynamic = "force-dynamic";

export default async function AdminShiftsPage() {
  const session = await requireSession();
  const shifts = await prisma.shift.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Shifts"
        description="Define working hours and late-grace rules"
      />
      <Card>
        <CardContent className="p-0">
          {shifts.length === 0 && (
            <div className="border-b border-edge">
              <EmptyState
                title="No shifts yet"
                description="Create a shift so employees can clock in against it."
                action={
                  <a
                    href="#shifts-manager"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-indigo-500"
                  >
                    Create shift
                  </a>
                }
              />
            </div>
          )}
          <ShiftsManager shifts={shifts} />
        </CardContent>
      </Card>
    </div>
  );
}
