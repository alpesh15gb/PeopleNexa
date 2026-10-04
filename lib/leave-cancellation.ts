import type { Prisma } from "@/generated/prisma/client";
import { assertLeavePayrollOpen } from "./leave-payroll-lock";

export async function reviewLeaveCancellation(tx: Prisma.TransactionClient, input: { tenantId: string; id: string; actorId: string; actorRole: string; approve: boolean; note: string }) {
  const request = await tx.leaveRequest.findFirst({ where: { id: input.id, tenantId: input.tenantId } });
  if (!request || request.status !== "approved" || !request.cancellationRequestedBy) throw Object.assign(new Error("No pending cancellation request."), { code: "CLAIM_CONFLICT" });
  if ([request.employeeId, request.createdBy, request.cancellationRequestedBy].includes(input.actorId)) throw Object.assign(new Error("You cannot review your own or a delegated cancellation request."), { code: "SELF_REVIEW" });
  if (input.approve) await assertLeavePayrollOpen(tx, input.tenantId, request.employeeId, request.fromDate, request.toDate);
  const changed = await tx.leaveRequest.updateMany({
    where: { id: request.id, tenantId: input.tenantId, status: "approved", cancellationRequestedBy: request.cancellationRequestedBy, cancellationRequestedAt: request.cancellationRequestedAt },
    data: { ...(input.approve ? { status: "cancelled" } : {}), cancellationRequestedBy: null, cancellationRequestedAt: null, cancellationReason: null },
  });
  if (!changed.count) throw Object.assign(new Error("Cancellation was already reviewed."), { code: "CLAIM_CONFLICT" });
  // Derived balances restore the original commitment exactly once.
  await tx.auditLog.create({ data: {
    tenantId: input.tenantId, actorId: input.actorId, actorRole: input.actorRole,
    action: input.approve ? "leave.cancellation.approve" : "leave.cancellation.reject", entity: "LeaveRequest", entityId: request.id,
    summary: input.note,
    before: { status: request.status, requestedBy: request.cancellationRequestedBy, reason: request.cancellationReason, days: request.days },
    after: { status: input.approve ? "cancelled" : "approved" },
  } });
}
