import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { istDateKey } from "@/lib/ist";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { RegularizationPanel } from "./regularization-panel";
import { employeeLocationScope } from "@/lib/location-scope";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminRegularizationPage() {
  const session = await requireSession();
  if (!["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) redirect("/employee");

  // Branch managers are locked to their own branch (ignore ?branch=); admin skips scoping entirely.
  const isBranchManager = session.role === "branch_manager";
  const ownScope = isBranchManager || session.role === "location_manager"
    ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, locationId: true, branch: { select: { name: true } } } })
    : null;
  const ownBranchId = ownScope?.branchId ?? null;
  const ownBranchName = ownScope?.branch?.name ?? "";
  const branchId = isBranchManager ? ownBranchId : null;
  const employeeScope = isBranchManager ? { branchId: branchId ?? "__unassigned__" } : session.role === "location_manager" ? employeeLocationScope(ownScope?.locationId ?? "__unassigned__") : {};

  const corrections = await prisma.punchCorrection.findMany({
    where: { tenantId: session.tenantId, employee: employeeScope },
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
  // self-service punches awaiting authorization. Photos are fetched lazily
  // through the same scoped endpoint used by mobile punch reports.
  const faceReviews = await prisma.punch.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [{ faceStatus: { in: ["review", "rejected"] } }, { authStatus: "pending" }],
      employee: employeeScope,
    },
    select: {
      id: true,
      punchTime: true,
      faceStatus: true,
      inOutHint: true,
      locationAccuracy: true,
      locationStatus: true,
      faceScore: true,
      lat: true,
      lng: true,
      authStatus: true,
      holdReason: true,
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
    },
    orderBy: { punchTime: "desc" },
    take: 50,
  });

  const photoIds = new Set((await prisma.punch.findMany({ where: { tenantId: session.tenantId, id: { in: faceReviews.map(punch => punch.id) }, selfie: { not: null } }, select: { id: true } })).map(punch => punch.id));

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
              inOutHint: r.inOutHint,
              locationAccuracy: r.locationAccuracy,
              locationStatus: r.locationStatus,
              faceStatus: r.faceStatus,
              faceScore: r.faceScore,
              selfie: photoIds.has(r.id) ? `/api/reports/mobile-punches?photo=${encodeURIComponent(r.id)}` : null,
              lat: r.lat,
              lng: r.lng,
              authStatus: (r as { authStatus?: string }).authStatus ?? "auto",
              holdReason: (r as { holdReason?: string | null }).holdReason ?? null,
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
