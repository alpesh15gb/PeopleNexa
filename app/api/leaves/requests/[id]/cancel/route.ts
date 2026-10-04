import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { canWithdrawLeaveRequest } from "@/lib/leave-lifecycle";
import { notifyAdmins } from "@/lib/notifications";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  try {
    const status = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!request) throw Object.assign(new Error("Leave request not found."), { code: "NOT_FOUND" });
      if (request.employeeId !== session.sub && request.createdBy !== session.sub) throw Object.assign(new Error("You can only cancel your own or submitted leave."), { code: "FORBIDDEN" });
      if (request.status === "approved") {
        if (!reason || reason.length > 2000) throw Object.assign(new Error("Enter a cancellation reason of at most 2,000 characters."), { code: "INVALID" });
        await assertLeavePayrollOpen(tx, session.tenantId, request.employeeId, request.fromDate, request.toDate);
        const changed = await tx.leaveRequest.updateMany({ where: { id, tenantId: session.tenantId, status: "approved", cancellationRequestedBy: null }, data: { cancellationRequestedBy: session.sub, cancellationRequestedAt: new Date(), cancellationReason: reason } });
        if (!changed.count) throw Object.assign(new Error("Cancellation is already awaiting review or this request changed."), { code: "CONFLICT" });
      } else {
        if (!canWithdrawLeaveRequest(request, session.sub)) throw Object.assign(new Error("Only pending or approved leave can be cancelled."), { code: "CONFLICT" });
        const changed = await tx.leaveRequest.updateMany({ where: { id, tenantId: session.tenantId, status: "pending" }, data: { status: "cancelled" } });
        if (!changed.count) throw Object.assign(new Error("This request is no longer pending."), { code: "CONFLICT" });
      }
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: request.status === "approved" ? "leave.cancellation.request" : "leave.withdraw", entity: "LeaveRequest", entityId: id, summary: reason || `Withdrew ${request.days} days`, before: { status: request.status }, after: { status: request.status === "approved" ? "cancellation_pending" : "cancelled" } } });
      return request.status === "approved" ? "cancellation_pending" : "cancelled";
    }, { isolationLevel: "Serializable" });
    if (status === "cancellation_pending") await notifyAdmins(session.tenantId, "info", "Leave cancellation needs review", "An approved leave cancellation is awaiting independent review in Leaves.").catch(() => console.warn("[leave] Cancellation saved; reviewer notification failed."));
    return NextResponse.json({ status });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (["NOT_FOUND", "FORBIDDEN", "INVALID", "CONFLICT", "PAYROLL_LOCKED", "P2034"].includes(code ?? "")) return NextResponse.json({ error: code === "P2034" ? "Leave changed concurrently. Refresh and try again." : (error as Error).message }, { status: code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "INVALID" ? 400 : 409 });
    throw error;
  }
}
