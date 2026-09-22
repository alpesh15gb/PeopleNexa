import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";
import { canWithdrawLeaveRequest } from "@/lib/leave-lifecycle";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const request = await prisma.leaveRequest.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, status: true, employeeId: true, createdBy: true, days: true, leaveType: { select: { name: true } } },
  });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canWithdrawLeaveRequest(request, session.sub)) {
    return NextResponse.json({ error: request.status !== "pending" ? "Only pending leave requests can be withdrawn." : "You can only withdraw a request you submitted or that belongs to you." }, { status: 403 });
  }

  const claimed = await prisma.leaveRequest.updateMany({
    where: { id, tenantId: session.tenantId, status: "pending" },
    data: { status: "cancelled" },
  });
  if (!claimed.count) return NextResponse.json({ error: "This request is no longer pending." }, { status: 409 });

  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "leave.withdraw",
    entity: "LeaveRequest",
    entityId: id,
    summary: `withdrew ${request.days}d ${request.leaveType.name}`,
    before: { status: "pending" },
    after: { status: "cancelled" },
  });
  return NextResponse.json({ status: "cancelled" });
}
