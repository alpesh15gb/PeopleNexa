import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat";
import { ShiftsManager } from "./shifts-manager";
import { unassignedSinglePunchHalfDay } from "@/lib/unassigned-shift-policy";

export const dynamic = "force-dynamic";

export default async function AdminShiftsPage() {
  const session = await requireSession();
  const shifts = await prisma.shift.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });
  const unassignedHalfDay = await unassignedSinglePunchHalfDay(session.tenantId);
  const canManageShifts = session.role === "admin";

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Shifts"
        description="Set working hours, weekly days off and late-arrival rules."
      />
      <Card>
        <CardContent className="p-0">
          {shifts.length === 0 && (
            <div className="border-b border-edge">
              <EmptyState
                title="No shifts yet"
                description={canManageShifts ? "Create a shift to define employees’ scheduled work hours." : "Ask a workspace admin to add a shift."}
                action={canManageShifts ? (
                  <a
                    href="#shifts-manager"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-indigo-500"
                  >
                    Create shift
                  </a>
                ) : undefined}
              />
            </div>
          )}
          <ShiftsManager shifts={shifts} unassignedHalfDay={unassignedHalfDay} canManageShifts={canManageShifts} />
        </CardContent>
      </Card>
    </div>
  );
}
