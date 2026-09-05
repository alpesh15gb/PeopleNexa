import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseIST } from "@/lib/ist";
import { reconcileEmployeeDay, isFinalizable, shiftWindow } from "@/lib/reconcile";

async function loadOwned(id: string, tenantId: string) {
  return prisma.attendance.findFirst({ where: { id, tenantId } });
}

// POST /api/attendance/:id/punches  { time: "2026-08-12T09:05:00" } — add a punch (IST) and re-derive.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const attendance = await loadOwned(id, session.tenantId);
  if (!attendance) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const time = String(body.time ?? "");
  // The input is a wall-clock IST time (from datetime-local or device text).
  const punchTime = parseIST(time.includes("T") ? time.replace("T", " ") : time);
  if (!punchTime || isNaN(punchTime.getTime())) {
    return NextResponse.json({ error: "Invalid time. Use YYYY-MM-DD HH:mm:ss (IST)." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const employee = await prisma.employee.findUnique({
    where: { id: attendance.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  // The punch must belong to this day's IST punch window (admin corrections
  // move times within the day; they don't glue days together). Night-shift
  // windows start at the shift start so the morning out punch is accepted.
  const { start: dayStart, end: dayEnd } = shiftWindow(attendance.date, employee.shift);
  if (punchTime < dayStart || punchTime >= dayEnd) {
    return NextResponse.json({ error: "Time is outside this day's window." }, { status: 400 });
  }

  await prisma.punch.create({
    data: {
      tenantId: session.tenantId,
      employeeId: attendance.employeeId,
      source: "admin",
      punchTime,
      inOutHint: "unknown",
    },
  });
  if (attendance.finalized) {
    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { finalized: false, reviewStatus: null, note: "pending finalization" },
    });
  }

  const result = await reconcileEmployeeDay(
    tenant ?? { id: session.tenantId, config: null },
    employee,
    attendance.date,
    { finalize: isFinalizable(attendance.date, undefined, employee.shift) }
  );
  const updated = result.attendanceId ? await prisma.attendance.findUnique({ where: { id: result.attendanceId } }) : null;
  return NextResponse.json({ success: true, record: updated, result });
}

// DELETE /api/attendance/:id/punches?punchId=... — remove a punch and re-derive.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const attendance = await loadOwned(id, session.tenantId);
  if (!attendance) return NextResponse.json({ error: "Attendance not found" }, { status: 404 });

  const punchId = req.nextUrl.searchParams.get("punchId");
  if (!punchId) return NextResponse.json({ error: "punchId is required" }, { status: 400 });

  const punch = await prisma.punch.findFirst({
    where: { id: punchId, employeeId: attendance.employeeId, tenantId: session.tenantId },
  });
  if (!punch) return NextResponse.json({ error: "Punch not found" }, { status: 404 });

  await prisma.punch.delete({ where: { id: punchId } });
  if (attendance.finalized) {
    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { finalized: false, reviewStatus: null, note: "pending finalization" },
    });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  const employee = await prisma.employee.findUnique({
    where: { id: attendance.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const result = await reconcileEmployeeDay(
    tenant ?? { id: session.tenantId, config: null },
    employee,
    attendance.date,
    { finalize: isFinalizable(attendance.date, undefined, employee.shift) }
  );
  const updated = result.attendanceId ? await prisma.attendance.findUnique({ where: { id: result.attendanceId } }) : null;
  return NextResponse.json({ success: true, record: updated, result });
}
