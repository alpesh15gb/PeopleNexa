import { prisma } from "@/lib/prisma";

export type LeaveCancellationDecision = { approved: boolean; note: string };

export async function leaveCancellationHistory(tenantId: string, requestIds: string[]) {
  const decisions = new Map<string, LeaveCancellationDecision>();
  if (!requestIds.length) return decisions;
  const events = await prisma.auditLog.findMany({
    where: {
      tenantId,
      entity: "LeaveRequest",
      entityId: { in: requestIds },
      action: { in: ["leave.cancellation.approve", "leave.cancellation.reject"] },
    },
    select: { entityId: true, action: true, summary: true },
    distinct: ["entityId"],
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  for (const event of events) {
    decisions.set(event.entityId, {
      approved: event.action === "leave.cancellation.approve",
      note: event.summary,
    });
  }
  return decisions;
}
