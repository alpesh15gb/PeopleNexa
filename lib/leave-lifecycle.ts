import type { Prisma } from "@/generated/prisma/client";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export const leaveAwaitingReview = {
  OR: [{ status: "pending" }, { status: "approved", cancellationRequestedAt: { not: null } }],
} satisfies Prisma.LeaveRequestWhereInput;

/** Terminal requests are immutable. A pending request can only be withdrawn by its subject or submitter. */
export function canWithdrawLeaveRequest(request: { status: string; employeeId: string; createdBy: string | null }, actorId: string) {
  return request.status === "pending" && (request.employeeId === actorId || request.createdBy === actorId);
}

/** A reviewer must never be the employee receiving leave or the delegated creator. */
export function canReviewLeaveRequest(request: { employeeId: string; createdBy: string | null }, actorId: string) {
  return request.employeeId !== actorId && request.createdBy !== actorId;
}
