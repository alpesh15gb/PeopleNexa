import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { istDateKey } from "@/lib/ist";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { RegularizationPanel } from "./regularization-panel";

export const dynamic = "force-dynamic";

export default async function AdminRegularizationPage() {
  const session = await requireSession();

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const ownScope = isBranchManager
    ? await prisma.employee.findUnique({ where: { id: session.sub }, select: { branchId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const branchId = isBranchManager ? ownBranchId : null;

  const corrections = await prisma.punchCorrection.findMany({
    where: { tenantId: session.tenantId, ...(branchId ? { employee: { branchId } } : {}) },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pending = corrections.filter((c) => c.status === "pending").length;

  // Flag corrections whose employee+day has a face review/rejected punch.
  const flaggedPunches = await prisma.punch.findMany({
    where: {
      tenantId: session.tenantId,
      faceStatus: { in: ["review", "rejected"] },
      employeeId: { in: corrections.map((c) => c.employeeId) },
    },
    select: { employeeId: true, punchTime: true },
    take: 500,
  });
  const flaggedDays = new Set(flaggedPunches.map((p) => `${p.employeeId}|${istDateKey(p.punchTime)}`));

  // Face review queue: recent gray-zone / rejected punches plus held
  // unenrolled self-service punches awaiting authorization (≤50 rows, so
  // selecting the ~375KB selfie per row is acceptable).
  const faceReviews = await prisma.punch.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [{ faceStatus: { in: ["review", "rejected"] } }, { authStatus: "pending" }],
      ...(branchId ? { employee: { branchId } } : {}),
    },
    select: {
      id: true,
      punchTime: true,
      faceStatus: true,
      faceScore: true,
      selfie: true,
      lat: true,
      lng: true,
      authStatus: true,
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: { punchTime: "desc" },
    take: 50,
  });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Punch Regularization"
        description={`${pending} pending request${pending === 1 ? "" : "s"} · approve or reject employee-requested corrections`}
        actions={
          isBranchManager ? (
            <span className="rounded-xl border border-edge bg-tint px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
              Branch: {ownBranchName}
            </span>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <RegularizationPanel
            corrections={corrections.map((c) => ({
              id: c.id,
              date: c.date.toISOString(),
              faceFlagged: flaggedDays.has(`${c.employeeId}|${istDateKey(c.date)}`),
              currentIn: c.currentIn?.toISOString() ?? null,
              currentOut: c.currentOut?.toISOString() ?? null,
              requestedIn: c.requestedIn?.toISOString() ?? null,
              requestedOut: c.requestedOut?.toISOString() ?? null,
              reason: c.reason,
              status: c.status,
              reviewNote: c.reviewNote,
              createdAt: c.createdAt.toISOString(),
              employee: {
                id: c.employee.id,
                firstName: c.employee.firstName,
                lastName: c.employee.lastName,
                employeeNumber: c.employee.employeeNumber,
              },
            }))}
            faceReviews={faceReviews.map((r) => ({
              id: r.id,
              punchTime: r.punchTime.toISOString(),
              faceStatus: r.faceStatus,
              faceScore: r.faceScore,
              selfie: r.selfie,
              lat: r.lat,
              lng: r.lng,
              authStatus: (r as { authStatus?: string }).authStatus ?? "auto",
              employee: {
                id: r.employee.id,
                firstName: r.employee.firstName,
                lastName: r.employee.lastName,
                employeeNumber: r.employee.employeeNumber,
              },
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
