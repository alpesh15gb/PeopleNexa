import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ExitsAdmin } from "./exits-admin";
import { pendingApprovalFilters } from "@/lib/approval-workspace";
import type { RecordSearchParams } from "@/lib/document-expense-pagination";
import { workspaceRegion } from "@/lib/workspace-region";

export const dynamic = "force-dynamic";

export default async function AdminExitsPage({ searchParams }: { searchParams: Promise<RecordSearchParams> }) {
  const [session, params] = await Promise.all([requireActiveSession().catch(() => null), searchParams]);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/employee/exits");
  const locationId = await managerLocationId(session);
  if (session.role === "location_manager" && !locationId) {
    return <PageHeader title="Exit management" description="Ask a workspace admin to assign your account to a location." />;
  }
  const reviewOnly = params.review === "approvals";
  const where = reviewOnly ? (await pendingApprovalFilters(session)).exit ?? { id: { in: [] } } : { tenantId: session.tenantId, ...(locationId ? { employee: employeeLocationScope(locationId) } : {}) };
  const [raw, tenant] = await Promise.all([prisma.exitRequest.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  }), prisma.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } })]);
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
        title={reviewOnly ? "Pending exit requests" : "Exit Management"}
        description="Resignations, notice periods and full & final settlements"
        actions={reviewOnly && <Link href="/admin/exits" className="text-sm font-medium text-primary hover:underline">View all exits</Link>}
      />
      <Card>
        <CardContent className="p-0">
          <ExitsAdmin requests={requests} actorId={session.sub} reviewOnly={reviewOnly} region={workspaceRegion(tenant.config)} />
        </CardContent>
      </Card>
    </div>
  );
}
