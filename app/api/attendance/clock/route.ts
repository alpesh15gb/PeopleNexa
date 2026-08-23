import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";
import { isInsideGeofence, distanceMeters } from "@/lib/geofence";
import { reconcileEmployeeDay } from "@/lib/reconcile";
import { punchDayForEmployee } from "@/lib/punch-day";
import { notifyEmployee } from "@/lib/notifications";

const MAX_SELFIE_LENGTH = 3_000_000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const selfie = typeof body.selfie === "string" ? body.selfie : null;

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "A valid location is required to punch in/out." }, { status: 400 });
  }
  if (selfie && selfie.length > MAX_SELFIE_LENGTH) {
    return NextResponse.json({ error: "Selfie image is too large." }, { status: 413 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    include: { branch: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Your account is inactive." }, { status: 403 });
  }

  if (employee.branch) {
    const inside = isInsideGeofence(
      employee.branch.latitude,
      employee.branch.longitude,
      employee.branch.geofenceRadius,
      lat,
      lng
    );
    if (!inside) {
      const dist = Math.round(
        distanceMeters(employee.branch.latitude!, employee.branch.longitude!, lat, lng)
      );
      return NextResponse.json(
        { error: `You are ${dist}m away from the ${employee.branch.name} geofence (${employee.branch.geofenceRadius}m allowed).` },
        { status: 403 }
      );
    }
  }

  const now = new Date();
  const near = await prisma.punch.findFirst({
    where: {
      tenantId: employee.tenantId,
      employeeId: employee.id,
      punchTime: { gte: new Date(now.getTime() - 60000), lte: new Date(now.getTime() + 60000) },
    },
  });
  if (near) {
    return NextResponse.json({ error: "A punch was already recorded in the last minute." }, { status: 409 });
  }

  const punch = await prisma.punch.create({
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

  await dispatchWebhook(employee.tenantId, "punch.created", {
    employeeId: employee.id,
    punchId: punch.id,
    time: punch.punchTime.toISOString(),
    lat,
    lng,
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: employee.tenantId } });
  const attendanceDay = await punchDayForEmployee(employee, now);
  const result = await reconcileEmployeeDay(
    tenant ?? { id: employee.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: employee.tenantId, branchId: employee.branchId },
    attendanceDay,
    { finalize: false }
  );

  const interpreted = result.punches.find((p) => p.id === punch.id)?.type;
  const action = interpreted === "out" ? "out" : "in";
  const record = result.attendanceId
    ? await prisma.attendance.findFirst({ where: { id: result.attendanceId, tenantId: employee.tenantId } })
    : null;

  if (action === "in" && result.status === "late") {
    const shift = record?.shiftId
      ? await prisma.shift.findFirst({ where: { id: record.shiftId, tenantId: employee.tenantId } })
      : null;
    await notifyEmployee(
      employee.tenantId,
      employee.id,
      "warning",
      "Marked late",
      `You clocked in ${result.lateMinutes} min late (${shift?.name ?? "your shift"} starts at ${shift?.startTime ?? "—"}).`
    );
  }

  return NextResponse.json({ success: true, action, record, status: result.status }, { status: 201 });
}
