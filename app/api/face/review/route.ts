import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, punchDayForShift } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { notifyEmployee } from "@/lib/notifications";
import { appendAudit } from "@/lib/audit";

/**
 * POST — human review of a gray-zone / rejected face punch, or authorization
 * of a held unenrolled self-service punch (selfie + location reviewed).
 * Body: { punchId, decision: "accept" | "reject" }.
 * - admin or supervisor only.
 * - punch must belong to the tenant (404) and be faceStatus review|rejected
 *   or authStatus pending (409).
 * - accept → faceStatus "matched" (review) or "approved" (pending), then
 *   reconcile the day (pending punches were never reconciled).
 * - reject → DELETE the punch + reconcileEmployeeDay for its day.
 * - accepting one pending punch auto-declines its same-day pending
 *   siblings (prevents double in/out pairs from repeated submissions).
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
  const isPendingAuth = (punch as { authStatus?: string }).authStatus === "pending";
  if (!isPendingAuth && punch.faceStatus !== "review" && punch.faceStatus !== "rejected") {
    return NextResponse.json({ error: "Punch is not pending review." }, { status: 409 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: punch.employeeId, tenantId: session.tenantId },
    include: { shift: true },
  });

  // Capture narrowed values for the closure below (TS can't narrow across it).
  const tenantId = session.tenantId;
  const punchTimeValue = punch.punchTime;

  async function reconcileDay() {
    if (!employee) return;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await reconcileEmployeeDay(
      tenant ?? { id: tenantId, config: null },
      {
        id: employee.id,
        shiftId: employee.shiftId,
        tenantId: employee.tenantId,
        branchId: employee.branchId,
      },
      punchDayForShift(punchTimeValue, employee.shift),
      { finalize: false }
    );
  }

  if (decision === "accept") {
    if (isPendingAuth) {
      // Authorize the held punch, then retire its same-day pending siblings
      // so a double-submitted in-punch can't become a phantom in/out pair.
      const dayStart = istStartOfDay(punch.punchTime);
      await prisma.punch.update({
        where: { id: punch.id },
        data: { faceStatus: "approved", authStatus: "approved" },
      });
      const siblings = await prisma.punch.findMany({
        where: {
          tenantId: session.tenantId,
          employeeId: punch.employeeId,
          authStatus: "pending",
          id: { not: punch.id },
          punchTime: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) },
        },
        select: { id: true },
      });
      if (siblings.length > 0) {
        await prisma.punch.deleteMany({ where: { id: { in: siblings.map((s) => s.id) } } });
      }
      await reconcileDay();
      await appendAudit({
        tenantId: session.tenantId,
        actorId: session.sub,
        actorRole: session.role,
        action: "face.review",
        entity: "Punch",
        entityId: punch.id,
        summary: `authorized held punch for ${punch.employeeId} (${siblings.length} sibling(s) declined)`,
        before: { faceStatus: punch.faceStatus, authStatus: "pending" },
        after: { faceStatus: "approved", authStatus: "approved" },
      });
      await notifyEmployee(
        session.tenantId,
        punch.employeeId,
        "success",
        "Punch approved",
        "Your held punch was approved by your admin and counted toward attendance."
      );
      return NextResponse.json({ ok: true, faceStatus: "approved", authStatus: "approved" });
    }
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
  await prisma.punch.delete({ where: { id: punch.id } });
  await reconcileDay();
  if (isPendingAuth) {
    await notifyEmployee(
      session.tenantId,
      punch.employeeId,
      "warning",
      "Punch declined",
      "Your held punch was declined by your admin and was not counted. Contact your admin if this is a mistake."
    );
  }
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "face.review",
    entity: "Punch",
    entityId: punch.id,
    summary: `${isPendingAuth ? "declined held punch" : "rejected face review"} for ${punch.employeeId} — punch deleted`,
    before: { faceStatus: punch.faceStatus },
    after: { faceStatus: "rejected" },
  });
  return NextResponse.json({ ok: true, faceStatus: "rejected" });
}
