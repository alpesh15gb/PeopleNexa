import { reviewLeaveCancellation } from "@/lib/leave-cancellation";
import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { NextRequest, NextResponse } from "next/server";
import { refreshEarnedLeaveBalances } from "@/lib/leave-accrual-refresh";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";
import { formatDate } from "@/lib/dates";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendWhatsApp } from "@/lib/whatsapp";
import { leaveRequestEntitlement } from "@/lib/leave-policy";
import {
  calculateLeaveBalance,
  canClaimLeave,
  policyHasUnlimitedEntitlement,
} from "@/lib/leave-balance";
import { canReviewLeaveRequest } from "@/lib/leave-lifecycle";
import { employeeLocationScope, managerLocationId } from "@/lib/location-scope";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireActiveSession().catch(() => null);
  if (
    !session ||
    (session.role !== "admin" &&
      session.role !== "branch_manager" &&
      session.role !== "location_manager")
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000))) return NextResponse.json({ error: "Invalid review data. Notes must be text of at most 2,000 characters." }, { status: 400 });
  const decision = String(body.status ?? "");
  if (!["approved", "rejected", "cancellation_approved", "cancellation_rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!request)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canReviewLeaveRequest(request, session.sub)) {
    return NextResponse.json(
      {
        error:
          "You cannot review a leave request you submitted or that belongs to you.",
      },
      { status: 403 },
    );
  }
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: request.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const locationId = await managerLocationId(session);
    const target = locationId
      ? await prisma.employee.findFirst({
          where: {
            id: request.employeeId,
            tenantId: session.tenantId,
            ...employeeLocationScope(locationId),
          },
          select: { id: true },
        })
      : null;
    if (!target)
      return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (decision.startsWith("cancellation_")) {
    try {
      await prisma.$transaction((tx) => reviewLeaveCancellation(tx, { tenantId: session.tenantId, id, actorId: session.sub, actorRole: session.role, approve: decision === "cancellation_approved", note: String(body.note ?? "").slice(0, 2000) }), { isolationLevel: "Serializable" });
      await notifyEmployee(session.tenantId, request.employeeId, "info", "Leave cancellation reviewed", decision === "cancellation_approved" ? "Your leave was cancelled and its balance restored. Regenerate any affected draft payroll before review." : "Your cancellation was rejected. The approved leave remains in effect.");
      return NextResponse.json({ success: true });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (["PAYROLL_LOCKED", "CLAIM_CONFLICT", "SELF_REVIEW", "P2034"].includes(code ?? "")) return NextResponse.json({ error: code === "P2034" ? "Leave changed concurrently. Refresh and try again." : (error as Error).message }, { status: code === "SELF_REVIEW" ? 403 : 409 });
      throw error;
    }
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been reviewed." },
      { status: 409 },
    );
  }

  const reviewNote = body.note || null;
  const reviewedAt = new Date();

  if (decision === "rejected") {
    // Atomic claim: only a pending row can transition to rejected.
    const claimed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.leaveRequest.updateMany({
      where: { id, tenantId: session.tenantId, status: "pending" },
      data: {
        status: "rejected",
        reviewedBy: session.sub,
        reviewedAt,
        reviewNote,
      },
    });
      if (claimed.count) await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "leave.review", entity: "LeaveRequest", entityId: id, summary: reviewNote ?? "Leave rejected", before: { status: "pending" }, after: { status: "rejected" } } });
      return claimed;
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "This request has already been reviewed." },
        { status: 409 },
      );
    }
    const updated = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { leaveType: true },
    });
    if (!updated)
      return NextResponse.json({ error: "not found" }, { status: 404 });

    await notifyEmployee(
      session.tenantId,
      request.employeeId,
      "danger",
      "Leave rejected",
      `Your ${updated.leaveType.name} (${formatDate(updated.fromDate)} → ${formatDate(updated.toDate)}) was rejected.`,
    );

    const employee = await prisma.employee.findUnique({
      where: { id: request.employeeId },
      select: { phone: true, firstName: true },
    });
    const admin = await prisma.employee.findUnique({
      where: { id: session.sub },
      select: { firstName: true },
    });
    await sendWhatsApp(session.tenantId, employee?.phone, "leave.rejected", {
      from: formatDate(updated.fromDate),
      to: formatDate(updated.toDate),
      admin: admin?.firstName ?? "HR",
      reason: body.note || "—",
    });

    return NextResponse.json({ request: updated });
  }

  // Approve: claim the pending row first (count==0 → a concurrent reviewer
  // won → 409), then re-check the balance including this request. Throwing
  // on over-balance rolls the claim back so the request stays pending.
  try {
    await prisma.$transaction(
      async (tx) => {
        await assertLeavePayrollOpen(tx, session.tenantId, request.employeeId, request.fromDate, request.toDate);
        await refreshEarnedLeaveBalances(tx, session.tenantId, [
          request.employeeId,
        ]);
        const claimed = await tx.leaveRequest.updateMany({
          where: { id, tenantId: session.tenantId, status: "pending" },
          data: {
            status: "approved",
            reviewedBy: session.sub,
            reviewedAt,
            reviewNote,
          },
        });
        if (claimed.count === 0) {
          const err = new Error(
            "This request has already been reviewed.",
          ) as Error & { code?: string };
          err.code = "CLAIM_CONFLICT";
          throw err;
        }
        const [approvedRows, leaveType] = await Promise.all([
          tx.leaveRequest.findMany({
            where: {
              tenantId: session.tenantId,
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              status: "approved",
            },
            select: { days: true, fromDate: true, leavePolicySnapshot: true },
          }),
          tx.leaveType.findUnique({ where: { id: request.leaveTypeId } }),
        ]);
        const periodId =
          request.leavePolicySnapshot &&
          typeof request.leavePolicySnapshot === "object"
            ? (request.leavePolicySnapshot as Record<string, unknown>)
                .policyPeriodId
            : null;
        const allocation =
          typeof periodId === "string"
            ? await tx.leavePolicyBalance.findFirst({
                where: {
                  tenantId: session.tenantId,
                  employeeId: request.employeeId,
                  leaveTypeId: request.leaveTypeId,
                  policyPeriodId: periodId,
                },
              })
            : null;
        const imported = allocation
          ? null
          : await tx.leaveBalanceImportEntry.findFirst({
              where: {
                tenantId: session.tenantId,
                employeeId: request.employeeId,
                leaveTypeId: request.leaveTypeId,
                periodEnd: { lte: request.fromDate },
              },
              orderBy: { periodEnd: "desc" },
            });
        const total = allocation
          ? approvedRows
              .filter(
                (row) =>
                  row.leavePolicySnapshot &&
                  typeof row.leavePolicySnapshot === "object" &&
                  (row.leavePolicySnapshot as Record<string, unknown>)
                    .policyPeriodId === periodId,
              )
              .reduce((sum, row) => sum + row.days, 0)
          : approvedRows
              .filter((row) => !imported || row.fromDate >= imported.periodEnd)
              .reduce((sum, row) => sum + row.days, 0);
        const cap = allocation
          ? (allocation.entitlement ?? 0) + allocation.carryForward
          : imported
            ? 0
            : (leaveRequestEntitlement(request.leavePolicySnapshot) ??
              leaveType?.maxDays);
        const unlimitedEntitlement = allocation
          ? policyHasUnlimitedEntitlement(allocation.policySnapshot)
          : !imported &&
            Boolean(
              ((request.leavePolicySnapshot as Record<string, unknown> | null)
                ?.rules &&
                policyHasUnlimitedEntitlement(request.leavePolicySnapshot)) ||
              leaveType?.unlimitedEntitlement,
            );
        const allowed = calculateLeaveBalance({
          cap: cap ?? null,
          opening: imported ? imported.available : 0,
          credited: 0,
          used: 0,
          pending: 0,
          unlimitedEntitlement,
        }).available;
        if (leaveType && !canClaimLeave(allowed, total)) {
          const err = new Error(
            `Approving this would exceed the ${leaveType.name} balance — ${allowed} day(s) allowed, ${total} day(s) would be approved.`,
          ) as Error & { code?: string };
          err.code = "OVER_BALANCE";
          throw err;
        }
        await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "leave.review", entity: "LeaveRequest", entityId: id, summary: reviewNote ?? "Leave approved", before: { status: "pending" }, after: { status: "approved", days: request.days } } });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2034")
      return NextResponse.json(
        {
          error:
            "Leave balances changed during approval. Refresh and try again.",
        },
        { status: 409 },
      );
    if (code === "PAYROLL_LOCKED" || code === "CLAIM_CONFLICT") {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 409 },
      );
    }
    if (code === "OVER_BALANCE") {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 },
      );
    }
    throw e;
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true },
  });
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  await notifyEmployee(
    session.tenantId,
    request.employeeId,
    "success",
    "Leave approved",
    `Your ${updated.leaveType.name} (${formatDate(updated.fromDate)} → ${formatDate(updated.toDate)}) was approved.`,
  );

  await dispatchWebhook(session.tenantId, "leave.approved", {
    requestId: request.id,
    employeeId: request.employeeId,
    leaveType: updated.leaveType.name,
    fromDate: formatDate(updated.fromDate),
    toDate: formatDate(updated.toDate),
    days: updated.days,
  });

  const employee = await prisma.employee.findUnique({
    where: { id: request.employeeId },
    select: { phone: true, firstName: true },
  });
  const admin = await prisma.employee.findUnique({
    where: { id: session.sub },
    select: { firstName: true },
  });
  await sendWhatsApp(session.tenantId, employee?.phone, "leave.approved", {
    from: formatDate(updated.fromDate),
    to: formatDate(updated.toDate),
    admin: admin?.firstName ?? "HR",
    reason: body.note || "—",
  });

  return NextResponse.json({ request: updated });
}
