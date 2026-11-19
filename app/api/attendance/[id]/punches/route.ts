import { assertLeavePayrollOpen } from "@/lib/leave-payroll-lock";
import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, isFinalizable, shiftForEmployeeDay, shiftWindow } from "@/lib/reconcile";
import { workspaceRegion } from "@/lib/workspace-region";
import { parseWorkspaceWallTime } from "@/lib/workspace-time";
import { isTransactionWriteConflict } from "@/lib/transaction-conflict";
import type { Attendance, Prisma, Shift } from "@/generated/prisma/client";

async function loadOwned(id: string, tenantId: string) {
  return prisma.attendance.findFirst({ where: { id, tenantId } });
}

async function refreshAttendance(
  tx: Prisma.TransactionClient,
  tenant: Parameters<typeof reconcileEmployeeDay>[0],
  employee: Parameters<typeof reconcileEmployeeDay>[1],
  attendance: Attendance,
  shift: Shift | null,
  timeZone: string,
) {
  await tx.attendance.updateMany({
    where: { id: attendance.id, finalized: true },
    data: { finalized: false, reviewStatus: null, note: "pending finalization" },
  });
  const result = await reconcileEmployeeDay(
    tenant, employee, attendance.date,
    { finalize: isFinalizable(attendance.date, undefined, shift, undefined, undefined, timeZone) },
    tx,
  );
  const record = result.attendanceId ? await tx.attendance.findUnique({ where: { id: result.attendanceId } }) : null;
  return { success: true, record, result };
}

function attendanceConflict(error: unknown) {
  if ((error as { code?: string } | null)?.code === "PAYROLL_LOCKED" && error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (isTransactionWriteConflict(error)) {
    return NextResponse.json({ error: "Payroll or attendance changed. Refresh and try again." }, { status: 409 });
  }
  throw error;
}

// POST /api/attendance/:id/punches — add a punch using the workspace wall clock.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const attendance = await loadOwned(id, session.tenantId);
  if (!attendance) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
  if (attendance.employeeId === session.sub) return NextResponse.json({ error: "Use an independently reviewed correction for your own punches." }, { status: 403 });
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: attendance.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: attendance.employeeId, tenantId: session.tenantId },
      select: { branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== manager.locationId) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const time = String(body.time ?? "");
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const { timeZone } = workspaceRegion(tenant?.config);
  const punchTime = parseWorkspaceWallTime(time, timeZone);
  if (!punchTime || isNaN(punchTime.getTime())) {
    return NextResponse.json({ error: `Enter a valid local time in ${timeZone}.` }, { status: 400 });
  }
  if (punchTime.getTime() > Date.now()) {
    return NextResponse.json({ error: "Punch time cannot be in the future." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: attendance.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  // The punch must belong to this day's workspace punch window (admin corrections
  // move times within the day; they don't glue days together). Night-shift
  // windows start at the shift start so the morning out punch is accepted.
  const attendanceShift = await shiftForEmployeeDay(employee, attendance.date, timeZone);
  const { start: dayStart, end: dayEnd } = shiftWindow(attendance.date, attendanceShift, timeZone);
  if (punchTime < dayStart || punchTime >= dayEnd) {
    return NextResponse.json({ error: "Time is outside this day's window." }, { status: 400 });
  }

  try {
    const payload = await prisma.$transaction(async (tx) => {
      await assertLeavePayrollOpen(tx, session.tenantId, attendance.employeeId, attendance.date, attendance.date);
      const created = await tx.punch.create({
        data: { tenantId: session.tenantId, employeeId: attendance.employeeId, source: "admin", punchTime, inOutHint: "unknown" },
      });
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "punch.add", entity: "Punch", entityId: created.id, summary: "Manually added punch", after: { punchTime: punchTime.toISOString(), employeeId: attendance.employeeId } } });
      return refreshAttendance(tx, tenant ?? { id: session.tenantId, config: null }, employee, attendance, attendanceShift, timeZone);
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(payload);
  } catch (error) {
    return attendanceConflict(error);
  }
}

// DELETE /api/attendance/:id/punches?punchId=... — remove a punch and re-derive.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || (session.role !== "admin" && session.role !== "supervisor" && session.role !== "branch_manager" && session.role !== "location_manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const attendance = await loadOwned(id, session.tenantId);
  if (!attendance) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
  if (attendance.employeeId === session.sub) return NextResponse.json({ error: "Use an independently reviewed correction for your own punches." }, { status: 403 });
  if (session.role === "branch_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!manager?.branchId) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: attendance.employeeId, tenantId: session.tenantId },
      select: { branchId: true },
    });
    if (!target || target.branchId !== manager.branchId) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
  }
  if (session.role === "location_manager") {
    const manager = await prisma.employee.findFirst({
      where: { id: session.sub, tenantId: session.tenantId },
      select: { locationId: true },
    });
    if (!manager?.locationId) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    const target = await prisma.employee.findFirst({
      where: { id: attendance.employeeId, tenantId: session.tenantId },
      select: { branch: { select: { locationId: true } } },
    });
    if (!target?.branch || target.branch.locationId !== manager.locationId) {
      return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
    }
  }

  const punchId = req.nextUrl.searchParams.get("punchId");
  if (!punchId) return NextResponse.json({ error: "punchId is required" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const { timeZone } = workspaceRegion(tenant?.config);
  const employee = await prisma.employee.findUnique({
    where: { id: attendance.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  try {
    const payload = await prisma.$transaction(async (tx) => {
      const punch = await tx.punch.findFirst({
        where: { id: punchId, employeeId: attendance.employeeId, tenantId: session.tenantId },
      });
      if (!punch) return null;
      const attendanceShift = await shiftForEmployeeDay(employee, attendance.date, timeZone, tx);
      const { start, end } = shiftWindow(attendance.date, attendanceShift, timeZone);
      if (punch.punchTime < start || punch.punchTime >= end) return null;
      await assertLeavePayrollOpen(tx, session.tenantId, attendance.employeeId, attendance.date, attendance.date);
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "punch.delete", entity: "Attendance", entityId: attendance.id, summary: "Removed punch from attendance ledger", before: { punchId, punchTime: punch.punchTime.toISOString(), employeeId: attendance.employeeId, source: punch.source } } });
      await tx.punch.delete({ where: { id: punchId } });
      return refreshAttendance(tx, tenant ?? { id: session.tenantId, config: null }, employee, attendance, attendanceShift, timeZone);
    }, { isolationLevel: "Serializable" });
    return payload ? NextResponse.json(payload) : NextResponse.json({ error: "Punch not found for this day." }, { status: 404 });
  } catch (error) {
    return attendanceConflict(error);
  }
}
