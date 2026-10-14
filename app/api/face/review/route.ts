import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { attendanceDayForPunch, reconcileEmployeeDay, isFinalizable, shiftForEmployeeDay } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { notifyEmployee } from "@/lib/notifications";
import { appendAudit } from "@/lib/audit";
import { employeeLocationScope } from "@/lib/location-scope";
import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";

/**
 * POST — human review of a gray-zone / rejected face punch, or authorization
 * of a held unenrolled self-service punch (selfie + location reviewed).
 * Body: { punchId, decision: "accept" | "reject" }.
 * - authorized managers, scoped to their branch/location, never self-review.
 * - punch must belong to the tenant (404) and be faceStatus review|rejected
 *   or authStatus pending (409).
 * - accept → faceStatus "matched" (review) or "approved" (pending), then
 *   reconcile the day (pending punches were never reconciled).
 * - reject → retain evidence with declined authorization and reconcile its day.
 * - each punch is reviewed independently; approving an IN never discards an OUT.
 */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || !["admin", "supervisor", "branch_manager", "location_manager"].includes(session.role)) {
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

  const manager = ["branch_manager", "location_manager"].includes(session.role) ? await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { branchId: true, locationId: true } }) : null;
  if ((session.role === "branch_manager" && !manager?.branchId) || (session.role === "location_manager" && !manager?.locationId)) return NextResponse.json({ error: "No assigned scope." }, { status: 403 });
  const punch = await prisma.punch.findFirst({
    where: { id: punchId, tenantId: session.tenantId, ...(session.role === "branch_manager" ? { employee: { branchId: manager!.branchId } } : session.role === "location_manager" ? { employee: employeeLocationScope(manager!.locationId!) } : {}) },
  });
  if (!punch) return NextResponse.json({ error: "Punch not found" }, { status: 404 });
  if (punch.employeeId === session.sub) return NextResponse.json({ error: "Another manager must review your punch." }, { status: 403 });
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
  const workDay = employee ? await attendanceDayForPunch(employee, punchTimeValue) : istStartOfDay(punchTimeValue);
  async function saveDecision(data: { faceStatus: string; authStatus?: string }) {
    try {
      const count = await prisma.$transaction(async tx => {
        await assertLeavePayrollOpen(tx, tenantId, punch!.employeeId, workDay, workDay);
        const changed = await tx.punch.updateMany({ where: { id: punch!.id, tenantId, authStatus: punch!.authStatus, faceStatus: punch!.faceStatus }, data });
        if (changed.count) await tx.auditLog.create({ data: { tenantId, actorId: session!.sub, actorRole: session!.role, action: "punch.authorization", entity: "Punch", entityId: punch!.id, summary: `Mobile punch ${decision}`, before: { authStatus: punch!.authStatus, faceStatus: punch!.faceStatus }, after: data } });
        return changed.count;
      }, { isolationLevel: "Serializable" });
      return count === 1 ? null : "Punch changed during review. Refresh and try again.";
    } catch (error) {
      if (["PAYROLL_LOCKED", "P2034"].includes((error as { code?: string }).code ?? "")) return (error as Error).message;
      throw error;
    }
  }

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
      await attendanceDayForPunch(employee, punchTimeValue),
      { finalize: isFinalizable(workDay, undefined, await shiftForEmployeeDay(employee, workDay)) }
    );
  }

  if (decision === "accept") {
    if (isPendingAuth) {
      // Authorize this event only; another held event may be its valid OUT.
      const error = await saveDecision({ faceStatus: "approved", authStatus: "approved" });
      if (error) return NextResponse.json({ error }, { status: 409 });
      await reconcileDay();
      await appendAudit({
        tenantId: session.tenantId,
        actorId: session.sub,
        actorRole: session.role,
        action: "face.review",
        entity: "Punch",
        entityId: punch.id,
        summary: `authorized held punch for ${punch.employeeId}; other punches retained for independent review`,
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
    const error = await saveDecision({ faceStatus: "approved", authStatus: "approved" });
    if (error) return NextResponse.json({ error }, { status: 409 });
    await reconcileDay();
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: "face.review",
      entity: "Punch",
      entityId: punch.id,
      summary: `accepted face review for ${punch.employeeId}`,
      before: { faceStatus: punch.faceStatus },
      after: { faceStatus: "approved", authStatus: "approved" },
    });
    return NextResponse.json({ ok: true, faceStatus: "approved", authStatus: "approved" });
  }

  // Retain declined evidence for reports without counting it toward attendance.
  const error = await saveDecision({ faceStatus: "declined", authStatus: "declined" });
  if (error) return NextResponse.json({ error }, { status: 409 });
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
    summary: `${isPendingAuth ? "declined held punch" : "rejected face review"} for ${punch.employeeId} — evidence retained`,
    before: { faceStatus: punch.faceStatus },
    after: { faceStatus: "declined", authStatus: "declined" },
  });
  return NextResponse.json({ ok: true, faceStatus: "declined", authStatus: "declined" });
}
