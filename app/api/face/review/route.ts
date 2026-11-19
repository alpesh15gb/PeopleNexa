import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { attendanceDayForPunch, reconcileEmployeeDay, isFinalizable, shiftForEmployeeDay } from "@/lib/reconcile";
import { notifyEmployee } from "@/lib/notifications";
import { auditEmployeeLabel } from "@/lib/audit-display";
import { employeeLocationScope } from "@/lib/location-scope";
import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { isTransactionWriteConflict } from "@/lib/transaction-conflict";
import { workspaceRegion } from "@/lib/workspace-region";

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
  const isPendingAuth = punch.authStatus === "pending";
  if (!isPendingAuth && punch.faceStatus !== "review" && punch.faceStatus !== "rejected") {
    return NextResponse.json({ error: "Punch is not pending review." }, { status: 409 });
  }

  const { tenantId } = session;
  const approved = decision === "accept";
  const status = approved ? "approved" : "declined";
  const authorization = { faceStatus: status, authStatus: status };

  try {
    const changed = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: punch.employeeId, tenantId } });
      if (!employee) return false;
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, config: true } });
      const { timeZone } = workspaceRegion(tenant?.config);
      const workDay = await attendanceDayForPunch(employee, punch.punchTime, timeZone, tx);
      await assertLeavePayrollOpen(tx, tenantId, employee.id, workDay, workDay);
      const claim = await tx.punch.updateMany({
        where: { id: punch.id, tenantId, authStatus: punch.authStatus, faceStatus: punch.faceStatus, punchTime: punch.punchTime },
        data: authorization,
      });
      if (claim.count !== 1) return false;
      await tx.attendance.updateMany({
        where: { tenantId, employeeId: employee.id, date: workDay, finalized: true },
        data: { finalized: false },
      });
      const shift = await shiftForEmployeeDay(employee, workDay, timeZone, tx);
      await reconcileEmployeeDay(
        tenant ?? { id: tenantId, config: null }, employee, workDay,
        { finalize: isFinalizable(workDay, undefined, shift, undefined, undefined, timeZone) }, tx,
      );
      await tx.auditLog.create({
        data: {
          tenantId, actorId: session.sub, actorRole: session.role, action: "punch.authorization",
          entity: "Punch", entityId: punch.id,
          summary: `Mobile punch ${status} for ${auditEmployeeLabel(employee)}`,
          before: { authStatus: punch.authStatus, faceStatus: punch.faceStatus },
          after: { ...authorization, employeeId: employee.id, employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, employeeNumber: employee.employeeNumber }, punchTime: punch.punchTime.toISOString() },
        },
      });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!changed) return NextResponse.json({ error: "Punch changed during review. Refresh and try again." }, { status: 409 });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "PAYROLL_LOCKED" && error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (isTransactionWriteConflict(error)) {
      return NextResponse.json({ error: "Payroll or attendance changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }

  if (isPendingAuth) {
    await notifyEmployee(
      tenantId,
      punch.employeeId,
      approved ? "success" : "warning",
      approved ? "Punch approved" : "Punch declined",
      approved
        ? "Your held punch was approved and counted toward attendance."
        : "Your held punch was declined. Contact your admin if this is a mistake.",
    ).catch((error) => console.warn("[punch review] notification failed:", error));
  }
  return NextResponse.json({ ok: true, ...authorization });
}
