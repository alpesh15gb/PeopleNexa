import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { istDateKey } from "@/lib/ist";
import { appendAudit } from "@/lib/audit";

const ALLOWED = ["present", "late", "permission", "absent", "half_day"];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: record.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: record.employeeId, tenantId: session.tenantId },
      select: { branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== manager.locationId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  return NextResponse.json({ record });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (body.punchInTime !== undefined || body.punchOutTime !== undefined) {
    return NextResponse.json(
      { error: "Punch times must be changed through the punch correction flow." },
      { status: 400 }
    );
  }

  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: record.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: record.employeeId, tenantId: session.tenantId },
      select: { branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== manager.locationId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  // A finalized/paid run locks the month. Changes must be recorded as a later
  // adjustment, never silently rewrite the payroll input snapshot.
  const month = istDateKey(record.date).slice(0, 7);
  const paidSlip = await prisma.payslip.findFirst({
    where: { employeeId: record.employeeId, month, status: { in: ["finalized", "paid"] } },
  });
  if (paidSlip) {
    return NextResponse.json(
      { error: `Payroll is locked for ${month}. Record a reviewed next-period adjustment; attendance cannot rewrite a finalized payroll run.` },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!ALLOWED.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    data.finalized = true;
    data.reviewStatus = "manual_override";
  }
  if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;

  const updated = await prisma.attendance.update({ where: { id }, data });
  await appendAudit({
    tenantId: session.tenantId,
    actorId: session.sub,
    actorRole: session.role,
    action: "attendance.override",
    entity: "Attendance",
    entityId: id,
    before: { status: record.status },
    after: { status: updated.status },
  });
  return NextResponse.json({ record: updated });
}
