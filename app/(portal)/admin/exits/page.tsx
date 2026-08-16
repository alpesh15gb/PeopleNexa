import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ExitsAdmin } from "./exits-admin";

export const dynamic = "force-dynamic";

export default async function AdminExitsPage() {
  const session = await requireSession();
  const raw = await prisma.exitRequest.findMany({
    where: { tenantId: session.tenantId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, salary: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  interface FandF {
    grossMonthly: number;
    perDay: number;
    earnedDays: number;
    earnedSalary: number;
    noticeDaysGiven: number;
    noticeShortfallDays: number;
    noticeDeduction: number;
    loanOutstanding: number;
    finalAmount: number;
  }
  const requests = raw.map((r) => ({ ...r, fAndF: (r.fAndF ?? null) as FandF | null }));

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Exit Management"
        description="Resignations, notice periods and full & final settlements"
      />
      <Card>
        <CardContent className="p-0">
          <ExitsAdmin requests={requests} />
        </CardContent>
      </Card>
    </div>
  );
}
