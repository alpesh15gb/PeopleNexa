import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, isFinalizable, shiftForEmployeeDay, shiftWindow, pairPunches, type PunchMode } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { notifyEmployee } from "@/lib/notifications";
import { formatDateIST } from "@/lib/dates";
import { workspaceRegion } from "@/lib/workspace-region";
import { appendAudit } from "@/lib/audit";
import { isTransactionWriteConflict } from "@/lib/transaction-conflict";

/** PATCH — admin/supervisor/branch/location managers approve or reject a pending correction. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (body.reviewNote != null && (typeof body.reviewNote !== "string" || body.reviewNote.length > 2000)) {
    return NextResponse.json({ error: "Enter a review note of up to 2,000 characters." }, { status: 400 });
  }
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be approved or rejected." }, { status: 400 });
  }

  const correction = await prisma.punchCorrection.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!correction) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (correction.employeeId === session.sub) return NextResponse.json({ error: "An independent reviewer must review your attendance correction." }, { status: 403 });
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: correction.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "Correction not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: correction.employeeId, tenantId: session.tenantId },
      select: { branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== manager.locationId) {
      return NextResponse.json({ error: "Correction not found" }, { status: 404 });
    }
  }
  if (correction.status !== "pending") {
    return NextResponse.json({ error: "This correction was already reviewed." }, { status: 400 });
  }

  if (status === "rejected") {
    // Atomic claim: only a pending row can transition to rejected.
    const claimed = await prisma.punchCorrection.updateMany({
      where: { id, tenantId: session.tenantId, status: "pending" },
      data: {
        status: "rejected",
        reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
        reviewedBy: session.sub,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This correction was already reviewed." }, { status: 409 });
    }
    const updated = await prisma.punchCorrection.findUnique({ where: { id } });
    await appendAudit({
      tenantId: session.tenantId,
      actorId: session.sub,
      actorRole: session.role,
      action: "correction.review",
      entity: "PunchCorrection",
      entityId: id,
      summary: `rejected correction for ${correction.employeeId}`,
      before: { status: "pending" },
      after: { status: "rejected" },
    });
    await notifyEmployee(
      correction.tenantId,
      correction.employeeId,
      "danger",
      "Punch correction rejected",
      `Your punch correction for ${formatDateIST(correction.date)} was rejected.`
    );
    return NextResponse.json({ correction: updated });
  }

  // Approve → apply the requested times to the punch ledger (source
  // "correction"), then re-derive. Editing punches — not the attendance row —
  // is what keeps the corrected times consistent: reconcile recomputes in/out
  // from the punch table, so patching attendance alone would be clobbered.
  const employee = await prisma.employee.findUnique({
    where: { id: correction.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "The employee no longer exists." }, { status: 404 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const { timeZone } = workspaceRegion(tenant?.config);
  const attendanceShift = await shiftForEmployeeDay(employee, correction.date, timeZone);
  const { start: windowStart, end: windowEnd } = shiftWindow(istStartOfDay(correction.date), attendanceShift, timeZone);
  // Validate requested times: in < out, within the shift window, not future.
  const now = new Date();
  if (correction.requestedIn && correction.requestedOut && correction.requestedIn.getTime() >= correction.requestedOut.getTime()) {
    return NextResponse.json({ error: "Requested in-time must be before out-time." }, { status: 400 });
  }
  for (const [label, t] of [["requestedIn", correction.requestedIn], ["requestedOut", correction.requestedOut]] as const) {
    if (!t) continue;
    if (t.getTime() > now.getTime()) {
      return NextResponse.json({ error: `${label} cannot be in the future.` }, { status: 400 });
    }
    if (t.getTime() < windowStart.getTime() || t.getTime() >= windowEnd.getTime()) {
      return NextResponse.json({ error: `${label} is outside the shift window for that day.` }, { status: 400 });
    }
  }

  // Claim, edit, and reconcile within one transaction so the reviewed request
  // and attendance ledger always become visible together.
  const reviewNote = body.reviewNote ? String(body.reviewNote).trim() : null;
  const reviewedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await assertLeavePayrollOpen(tx, session.tenantId, correction.employeeId, correction.date, correction.date);
      const claimed = await tx.punchCorrection.updateMany({
        where: { id, tenantId: session.tenantId, status: "pending" },
        data: { status: "approved", reviewNote, reviewedBy: session.sub, reviewedAt },
      });
      if (claimed.count === 0) {
        const err = new Error("CLAIM_CONFLICT") as Error & { code?: string };
        err.code = "CLAIM_CONFLICT";
        throw err;
      }
      const punchWindow = { tenantId: session.tenantId, employeeId: correction.employeeId, punchTime: { gte: windowStart, lt: windowEnd } };
      if (session.role !== "admin" && await tx.punch.findFirst({
        where: { ...punchWindow, faceStatus: "rejected" },
        select: { id: true },
      })) {
        throw Object.assign(new Error("Face-rejected punches require an admin to approve."), { code: "FACE_REVIEW_REQUIRED" });
      }
      const authorizedWindow = { ...punchWindow, authStatus: { in: ["auto", "approved"] } };
      const punches = await tx.punch.findMany({
        where: authorizedWindow,
        orderBy: [{ punchTime: "asc" }, { id: "asc" }],
        select: { id: true, inOutHint: true, punchTime: true, source: true, deviceId: true },
      });
      const config = tenant?.config as { punches?: { mode?: PunchMode } } | null;
      const paired = pairPunches(punches, config?.punches?.mode ?? "first_last", new Map());
      const recordedIn = paired.find((entry) => entry.type === "in");
      const recordedOut = paired.findLast((entry) => entry.type === "out");
      const nextIn = correction.requestedIn ?? (recordedIn ? new Date(recordedIn.time) : null);
      const nextOut = correction.requestedOut ?? (recordedOut ? new Date(recordedOut.time) : null);
      if (nextIn && nextOut && nextIn >= nextOut) {
        throw Object.assign(new Error("Clock-in must be before clock-out. Ask the employee to submit the correct times."), { code: "INVALID_SPAN" });
      }
      for (const [hint, time, entry] of [
        ["in", correction.requestedIn, recordedIn],
        ["out", correction.requestedOut, recordedOut],
      ] as const) {
        if (!time) continue;
        if (entry) await tx.punch.update({ where: { id: entry.id }, data: { punchTime: time } });
        else await tx.punch.create({ data: {
          tenantId: session.tenantId, employeeId: correction.employeeId, source: "correction", punchTime: time, inOutHint: hint,
        } });
      }

      // A reviewed correction is authoritative. Reopen a previously finalized
      // derived row so reconciliation cannot return the old locked values.
      await tx.attendance.updateMany({
        where: {
          tenantId: session.tenantId,
          employeeId: correction.employeeId,
          date: correction.date,
        },
        data: { finalized: false, reviewStatus: null },
      });

      const result = await reconcileEmployeeDay(
        tenant ?? { id: session.tenantId, config: null },
        employee,
        correction.date,
        { finalize: isFinalizable(correction.date, undefined, attendanceShift, undefined, undefined, timeZone) },
        tx,
      );
      if ((correction.requestedIn && +correction.requestedIn !== result.inAt?.getTime()) ||
          (correction.requestedOut && +correction.requestedOut !== result.outAt?.getTime())) {
        throw Object.assign(new Error("The requested times do not match the resulting clock-in and clock-out. Check the existing punches and work schedule before reviewing this request."), { code: "INVALID_SPAN" });
      }
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const message = e instanceof Error ? e.message : "";
    if (code === "FACE_REVIEW_REQUIRED") return NextResponse.json({ error: message }, { status: 403 });
    if (code === "PAYROLL_LOCKED" || isTransactionWriteConflict(e)) return NextResponse.json({ error: code === "PAYROLL_LOCKED" ? message : "Payroll or attendance changed. Refresh and try again." }, { status: 409 });
    if (code === "CLAIM_CONFLICT" || message === "CLAIM_CONFLICT") {
      return NextResponse.json({ error: "This correction was already reviewed." }, { status: 409 });
    }
    if (code === "INVALID_SPAN") return NextResponse.json({ error: message }, { status: 400 });
    throw e;
  }

  const updated = await prisma.punchCorrection.findUnique({ where: { id } });
  if (!updated) return NextResponse.json({ error: "Correction not found" }, { status: 404 });

  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "correction.review",
    entity: "PunchCorrection",
    entityId: id,
    summary: `approved correction for ${correction.employeeId}`,
    before: { status: "pending" },
    after: { status: "approved" },
  });

  await notifyEmployee(
    correction.tenantId,
    correction.employeeId,
    "success",
    "Punch correction approved",
    `Your punch correction for ${formatDateIST(correction.date)} was approved.`
  );

  return NextResponse.json({ correction: updated });
}
