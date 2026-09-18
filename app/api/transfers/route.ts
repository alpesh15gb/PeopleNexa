import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { fromDateKey } from "@/lib/dates";
import { appendAudit } from "@/lib/audit";

async function locationScope(session: { role: string; sub: string; tenantId: string }) {
  if (session.role !== "location_manager") return {};
  const locationId = (await prisma.employee.findFirst({ where: { id: session.sub, tenantId: session.tenantId }, select: { locationId: true } }))?.locationId;
  return locationId ? { branch: { locationId } } : { branch: { locationId: "__none__" } };
}

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scope = await locationScope(session);
  const transfers = await prisma.employeeTransfer.findMany({ where: { tenantId: session.tenantId, employee: scope }, include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } }, orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }] });
  return NextResponse.json({ transfers });
}

export async function POST(request: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "location_manager")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? ""); const destinationBranchId = String(body.destinationBranchId ?? ""); const reason = String(body.reason ?? "").trim(); const effectiveDate = fromDateKey(String(body.effectiveDate ?? ""));
  if (!employeeId || !destinationBranchId || !reason || Number.isNaN(effectiveDate.getTime())) return NextResponse.json({ error: "Employee, destination branch, reason, and effective date are required." }, { status: 400 });
  const scope = await locationScope(session);
  const [employee, branch] = await Promise.all([prisma.employee.findFirst({ where: { id: employeeId, tenantId: session.tenantId, ...scope } }), prisma.branch.findFirst({ where: { id: destinationBranchId, tenantId: session.tenantId } })]);
  if (!employee || !branch) return NextResponse.json({ error: "Employee or destination branch was not found in your scope." }, { status: 404 });
  if (session.role === "location_manager" && branch.locationId !== (await prisma.employee.findFirst({ where: { id: session.sub }, select: { locationId: true } }))?.locationId) return NextResponse.json({ error: "Destination branch must be in your assigned location." }, { status: 403 });
  if (employee.branchId === branch.id) return NextResponse.json({ error: "Employee is already assigned to this branch." }, { status: 400 });
  const openExit = await prisma.exitRequest.findFirst({ where: { tenantId: session.tenantId, employeeId, status: { in: ["pending", "approved"] } } });
  if (openExit) return NextResponse.json({ error: "Resolve the employee's open exit request before scheduling a transfer." }, { status: 400 });
  const existing = await prisma.employeeTransfer.findFirst({ where: { tenantId: session.tenantId, employeeId, status: "scheduled" } });
  if (existing) return NextResponse.json({ error: "This employee already has a scheduled transfer." }, { status: 400 });
  const transfer = await prisma.employeeTransfer.create({ data: { tenantId: session.tenantId, employeeId, sourceBranchId: employee.branchId, sourceDepartmentId: employee.departmentId, sourceShiftId: employee.shiftId, sourceManagerId: employee.managerId, destinationBranchId: branch.id, destinationDepartmentId: body.destinationDepartmentId ? String(body.destinationDepartmentId) : null, destinationShiftId: body.destinationShiftId ? String(body.destinationShiftId) : null, destinationManagerId: body.destinationManagerId ? String(body.destinationManagerId) : null, destinationPosition: body.destinationPosition ? String(body.destinationPosition).trim() : null, effectiveDate, reason, note: body.note ? String(body.note).trim() : null, requestedBy: session.sub } });
  await appendAudit({ tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "transfer.schedule", entity: "EmployeeTransfer", entityId: transfer.id, summary: `${employee.firstName} ${employee.lastName} transfer scheduled`, after: { employeeId, sourceBranchId: employee.branchId, destinationBranchId: branch.id, effectiveDate: effectiveDate.toISOString() } });
  return NextResponse.json({ transfer }, { status: 201 });
}
