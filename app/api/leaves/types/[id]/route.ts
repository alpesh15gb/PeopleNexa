import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canDeleteLeaveType } from "@/lib/leave-type";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const type = await prisma.leaveType.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.leaveType.update({
    where: { id },
    data: {
      name: body.name ?? type.name,
      maxDays: body.maxDays === undefined ? type.maxDays : body.maxDays === null || body.maxDays === "" || Number(body.maxDays) === 0 ? null : Number(body.maxDays),
      unlimitedEntitlement: body.unlimitedEntitlement === undefined ? type.unlimitedEntitlement : body.unlimitedEntitlement === true,
      encashable: body.encashable === undefined ? type.encashable : body.encashable === true && (body.paid ?? type.paid) === true && (body.unlimitedEntitlement ?? type.unlimitedEntitlement) !== true,
      isCarryForward: body.isCarryForward != null ? Boolean(body.isCarryForward) : type.isCarryForward,
      requiresApproval: body.requiresApproval != null ? Boolean(body.requiresApproval) : type.requiresApproval,
      paid: typeof body.paid === "boolean" ? body.paid : type.paid,
      color: body.color ?? type.color,
    },
  });
  return NextResponse.json({ type: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const type = await prisma.leaveType.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [requests, policyBalances, importBatches, importEntries] = await Promise.all([
    prisma.leaveRequest.count({ where: { tenantId: session.tenantId, leaveTypeId: id } }),
    prisma.leavePolicyBalance.count({ where: { tenantId: session.tenantId, leaveTypeId: id } }),
    prisma.leaveBalanceImportBatch.count({ where: { tenantId: session.tenantId, leaveTypeId: id } }),
    prisma.leaveBalanceImportEntry.count({ where: { tenantId: session.tenantId, leaveTypeId: id } }),
  ]);
  if (!canDeleteLeaveType([requests, policyBalances, importBatches, importEntries])) {
    return NextResponse.json({ error: "This leave type has recorded leave history or balances and cannot be deleted." }, { status: 409 });
  }
  await prisma.leaveType.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
