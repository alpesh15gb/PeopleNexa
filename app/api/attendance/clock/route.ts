import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";
import { isInsideGeofence, distanceMeters } from "@/lib/geofence";
import { reconcileEmployeeDay, punchDayForShift } from "@/lib/reconcile";
import { notifyEmployee } from "@/lib/notifications";
import { describeFace, verifyFace } from "@/lib/face";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lat = body.lat != null && body.lat !== "" ? Number(body.lat) : null;
  const lng = body.lng != null && body.lng !== "" ? Number(body.lng) : null;
  const selfie = typeof body.selfie === "string" && body.selfie.length < 500_000 ? body.selfie : null;
  if ((lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
    return NextResponse.json({ error: "Location coordinates are invalid." }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    include: { branch: true, shift: true },
  });
  if (!employee) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Your account is inactive." }, { status: 403 });
  }

  // Location is required when the branch has a geofence; otherwise an
  // employee without a branch could punch from anywhere with no coordinates.
  const branchHasCoords =
    employee.branch?.latitude != null &&
    employee.branch?.longitude != null &&
    Number.isFinite(Number(employee.branch.latitude)) &&
    Number.isFinite(Number(employee.branch.longitude));
  if (branchHasCoords && (lat == null || lng == null)) {
    return NextResponse.json({ error: "Location is required to punch in/out." }, { status: 400 });
  }
  // Location validation when a branch geofence is configured.
  if (lat != null && lng != null && employee.branch && branchHasCoords) {
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

  // ── Face VERIFY (additive, never blocks pay on ML failure) ──────────────
  // Reads tenant.config.faceMatch {enabled, matchThreshold, reviewThreshold}
  // with defaults enabled:true, 0.62/0.50 when absent. Kill-switch
  // (enabled===false) skips all face logic. No enrollment → "none".
  // describeFace null → "review". verifyFace below review → 400 rejected
  // WITHOUT creating a punch. Geofence/dedupe/reconcile below untouched.
  let faceStatus = "none";
  let faceScore: number | null = null;
  {
    const tenantForFace = await prisma.tenant.findUnique({
      where: { id: employee.tenantId },
      select: { config: true },
    });
    const cfgRaw = (tenantForFace?.config ?? {}) as {
      faceMatch?: Partial<{ enabled: boolean; matchThreshold: number; reviewThreshold: number }>;
    };
    const fm = cfgRaw.faceMatch ?? {};
    const faceEnabled = fm.enabled ?? true;
    const matchThreshold =
      typeof fm.matchThreshold === "number" && Number.isFinite(fm.matchThreshold)
        ? fm.matchThreshold
        : 0.62;
    const reviewThreshold =
      typeof fm.reviewThreshold === "number" && Number.isFinite(fm.reviewThreshold)
        ? fm.reviewThreshold
        : 0.5;
    if (faceEnabled) {
      const enrollment = await prisma.faceEnrollment.findFirst({
        where: { tenantId: employee.tenantId, employeeId: employee.id },
      });
      if (enrollment) {
        let probe: number[] | null = null;
        if (selfie) {
          try {
            const commaIdx = selfie.indexOf(",");
            const b64 = commaIdx >= 0 ? selfie.slice(commaIdx + 1) : selfie;
            const buf = Buffer.from(b64, "base64");
            if (buf.length > 0) {
              probe = await describeFace(buf);
            }
          } catch {
            probe = null;
          }
        }
        if (!probe) {
          // ML failure / missing / undecodable selfie → human review, never block pay.
          faceStatus = "review";
          faceScore = null;
        } else {
          const raw = enrollment.embeddings as unknown;
          const stored = Array.isArray(raw)
            ? (raw as unknown[]).filter(
                (s): s is number[] =>
                  Array.isArray(s) &&
                  s.length > 0 &&
                  (s as unknown[]).every((n) => typeof n === "number" && Number.isFinite(n as number))
              )
            : [];
          if (stored.length === 0) {
            // Corrupt/empty enrollment → review, never block pay.
            faceStatus = "review";
            faceScore = null;
          } else {
            const verdict = await verifyFace(stored, probe, { matchThreshold, reviewThreshold });
            const rounded = Number.isFinite(verdict.score)
              ? Math.round(verdict.score * 10000) / 10000
              : null;
            if (verdict.status === "matched") {
              faceStatus = "matched";
              faceScore = rounded;
            } else if (verdict.status === "review") {
              faceStatus = "review";
              faceScore = rounded;
            } else {
              return NextResponse.json(
                { error: "Face did not match — retake your selfie", faceStatus: "rejected" },
                { status: 400 }
              );
            }
          }
        }
      }
    }
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
      faceScore,
      faceStatus,
    },
  });
  await dispatchWebhook(employee.tenantId, "punch.created", {
    employeeId: employee.id,
    punchId: punch.id,
    time: punch.punchTime.toISOString(),
    lat,
    lng,
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
