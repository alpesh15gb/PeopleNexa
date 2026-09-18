import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { startOfDay } from "@/lib/dates";
import { appendAudit } from "@/lib/audit";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const action = String((await request.json().catch(() => ({}))).action ?? "");
  const transfer = await prisma.employeeTransfer.findFirst({ where: { id, tenantId: session.tenantId }, include: { employee: { select: { branch: { select: { locationId: true } } } } } });
  if (!transfer || (session.role === "location_manager" && transfer.employee.branch?.locationId !== (await prisma.employee.findFirst({ where: { id: session.sub }, select: { locationId: true } }))?.locationId)) return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
  if (transfer.status !== "scheduled") return NextResponse.json({ error: "Only scheduled transfers can be changed." }, { status: 400 });
  if (action === "cancel") { const updated = await prisma.employeeTransfer.update({ where: { id }, data: { status: "cancelled", cancelledBy: session.sub, cancelledAt: new Date() } }); await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "transfer.cancel", entity: "EmployeeTransfer", entityId: id }); return NextResponse.json({ transfer: updated }); }
  if (action !== "complete") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (startOfDay(new Date()) < startOfDay(transfer.effectiveDate)) return NextResponse.json({ error: "Transfer can only be completed on or after its effective date." }, { status: 400 });
  const updated = await prisma.$transaction(async (tx) => { await tx.employee.update({ where: { id: transfer.employeeId }, data: { branchId: transfer.destinationBranchId, departmentId: transfer.destinationDepartmentId, shiftId: transfer.destinationShiftId, managerId: transfer.destinationManagerId, ...(transfer.destinationPosition ? { position: transfer.destinationPosition } : {}) } }); return tx.employeeTransfer.update({ where: { id }, data: { status: "completed", completedBy: session.sub, completedAt: new Date() } }); });
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "transfer.complete", entity: "EmployeeTransfer", entityId: id });
  return NextResponse.json({ transfer: updated });
}
