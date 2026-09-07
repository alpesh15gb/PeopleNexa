import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, punchDayForShift } from "@/lib/reconcile";
import { appendAudit } from "@/lib/audit";

/**
 * POST — human review of a gray-zone / rejected face punch.
 * Body: { punchId, decision: "accept" | "reject" }.
 * - admin or supervisor only.
 * - punch must belong to the tenant (404) and be faceStatus review|rejected (409).
 * - accept → faceStatus "matched".
 * - reject → DELETE the punch + reconcileEmployeeDay for its day.
 */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const punchId = typeof body.punchId === "string" ? body.punchId : "";
  const decision = body.decision;
  if (!punchId) {
    return NextResponse.json({ error: "punchId is required." }, { status: 400 });
  }
  if (decision !== "accept" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be accept or reject." }, { status: 400 });
  }

  const punch = await prisma.punch.findFirst({
    where: { id: punchId, tenantId: session.tenantId },
  });
  if (!punch) return NextResponse.json({ error: "Punch not found" }, { status: 404 });
  if (punch.faceStatus !== "review" && punch.faceStatus !== "rejected") {
    return NextResponse.json({ error: "Punch is not pending face review." }, { status: 409 });
  }

  if (decision === "accept") {
    await prisma.punch.update({
      where: { id: punch.id },
      data: { faceStatus: "matched" },
    });
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: "face.review",
      entity: "Punch",
      entityId: punch.id,
      summary: `accepted face review for ${punch.employeeId}`,
      before: { faceStatus: punch.faceStatus },
      after: { faceStatus: "matched" },
    });
    return NextResponse.json({ ok: true, faceStatus: "matched" });
  }

  // Reject: the punch must not count toward attendance — remove it from the
  // immutable ledger and re-derive the day. The "rejected" status is conveyed
  // via the response + audit (the row itself is gone).
  const employee = await prisma.employee.findFirst({
    where: { id: punch.employeeId, tenantId: session.tenantId },
    include: { shift: true },
  });
  const punchTime = punch.punchTime;
  await prisma.punch.delete({ where: { id: punch.id } });
  if (employee) {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    await reconcileEmployeeDay(
      tenant ?? { id: session.tenantId, config: null },
      {
        id: employee.id,
        shiftId: employee.shiftId,
        tenantId: employee.tenantId,
        branchId: employee.branchId,
      },
      punchDayForShift(punchTime, employee.shift),
      { finalize: false }
    );
  }
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "face.review",
    entity: "Punch",
    entityId: punch.id,
    summary: `rejected face review for ${punch.employeeId} — punch deleted`,
    before: { faceStatus: punch.faceStatus },
    after: { faceStatus: "rejected" },
  });
  return NextResponse.json({ ok: true, faceStatus: "rejected" });
}
