import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isInsideGeofence, distanceMeters } from "@/lib/geofence";
import { reconcileEmployeeDay, punchDayForShift } from "@/lib/reconcile";
import { notifyEmployee } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const selfie = body.selfie || null;

  const employee = await prisma.employee.findUnique({
    where: { id: session.sub },
    include: { branch: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Your account is inactive." }, { status: 403 });
  }

  // Location validation when a branch geofence is configured.
  if (lat != null && lng != null && employee.branch) {
    const inside = isInsideGeofence(
      employee.branch.latitude,
      employee.branch.longitude,
      employee.branch.geofenceRadius,
      lat,
      lng
    );
    if (!inside) {
      const dist = Math.round(distanceMeters(employee.branch.latitude!, employee.branch.longitude!, lat, lng));
      return NextResponse.json(
        { error: `You are ${dist}m away from the ${employee.branch.name} geofence (${employee.branch.geofenceRadius}m allowed).` },
        { status: 403 }
      );
    }
  } else if (lat == null || lng == null) {
    return NextResponse.json({ error: "Location is required to punch in/out." }, { status: 400 });
  }

  const now = new Date();

  // 1. Record the immutable punch (dedupe ±60s).
  const near = await prisma.punch.findFirst({
    where: {
      employeeId: employee.id,
      punchTime: { gte: new Date(now.getTime() - 60000), lte: new Date(now.getTime() + 60000) },
    },
  });
  if (near) {
    return NextResponse.json({ error: "A punch was already recorded in the last minute." }, { status: 400 });
  }
  await prisma.punch.create({
    data: {
      tenantId: employee.tenantId,
      employeeId: employee.id,
      source: "mobile",
      punchTime: now,
      inOutHint: "unknown",
      lat,
      lng,
      selfie,
    },
  });

  // 2. Re-derive the day's attendance from all punches (night-shift morning
  //    outs reconcile against the previous calendar day).
  const tenant = await prisma.tenant.findUnique({ where: { id: employee.tenantId } });
  const result = await reconcileEmployeeDay(
    tenant ?? { id: employee.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: employee.tenantId, branchId: employee.branchId },
    punchDayForShift(now, employee.shift),
    { finalize: false }
  );

  // 3. Tell the client which transition happened.
  const isIn = result.inAt !== null && Math.abs(result.inAt.getTime() - now.getTime()) < 120000;
  const action = result.action === "created" ? "in" : isIn ? "in" : "out";

  const record = result.attendanceId
    ? await prisma.attendance.findUnique({ where: { id: result.attendanceId } })
    : null;

  if (action === "in" && result.status === "late") {
    await notifyEmployee(
      employee.tenantId,
      employee.id,
      "warning",
      "Marked late",
      `You clocked in ${result.lateMinutes} min late (${employee.shift?.name ?? "your shift"} starts at ${employee.shift?.startTime ?? "—"}).`
    );
  }

  return NextResponse.json({ success: true, action, record, status: result.status }, { status: 201 });
}
