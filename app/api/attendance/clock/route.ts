import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";
import { isInsideGeofence, distanceMeters } from "@/lib/geofence";
import { attendanceDayForPunch, reconcileEmployeeDay } from "@/lib/reconcile";
import { notifyEmployee } from "@/lib/notifications";
import { appendAudit } from "@/lib/audit";
import { describeFace, verifyFace } from "@/lib/face";
import { createPunchForEvent } from "@/lib/punch-idempotency";
import { mobileLocation, mobileSelfieBytes, mobileHoldReason, mobileCaptureTime } from "@/lib/mobile-attendance";

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const retryKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const priorPunch = /^[A-Za-z0-9_-]{16,128}$/.test(retryKey) ? await prisma.punch.findUnique({ where: { eventKey: `mobile:${session.sub}:${retryKey}` } }) : null;
  let lat: number, lng: number, accuracy: number, selfieBytes: Buffer;
  const selfie = body.selfie;
  try {
    ({ lat, lng, accuracy } = mobileLocation(body));
    selfieBytes = mobileSelfieBytes(selfie);
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const actionHint = body.action;
  if (actionHint !== "in" && actionHint !== "out") return NextResponse.json({ error: "Choose clock-in or clock-out." }, { status: 400 });
  let selfieCapturedAt: Date;
  try { selfieCapturedAt = mobileCaptureTime(body.selfieCapturedAt, Date.now(), Boolean(priorPunch)); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    return NextResponse.json({ error: "A valid punch request ID is required." }, { status: 400 });
  }
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
  if ((employee as { loginOnly?: boolean }).loginOnly) {
    return NextResponse.json({ error: "Manager logins cannot punch in/out." }, { status: 403 });
  }
  if (priorPunch) {
    if (priorPunch.authStatus === "declined") return NextResponse.json({ error: "This punch was declined by a reviewer. Refresh attendance before submitting another attempt." }, { status: 409 });
    if (priorPunch.authStatus === "pending") return NextResponse.json({ success: true, duplicate: true, pendingApproval: true, holdReason: priorPunch.holdReason });
    const tenant = await prisma.tenant.findUnique({ where: { id: employee.tenantId } });
    const result = await reconcileEmployeeDay(tenant ?? { id: employee.tenantId, config: null }, employee, await attendanceDayForPunch(employee, priorPunch.punchTime), { finalize: false });
    return NextResponse.json({ success: true, duplicate: true, action: priorPunch.inOutHint === "unknown" ? result.action === "created" ? "in" : "out" : priorPunch.inOutHint });
  }

  // Location is required when the branch has a geofence; otherwise an
  // employee without a branch could punch from anywhere with no coordinates.
  const branchHasCoords =
    employee.branch?.latitude != null &&
    employee.branch?.longitude != null &&
    Number.isFinite(Number(employee.branch.latitude)) &&
    Number.isFinite(Number(employee.branch.longitude)) &&
    Math.abs(Number(employee.branch.latitude)) <= 90 &&
    Math.abs(Number(employee.branch.longitude)) <= 180;
  if (branchHasCoords && (lat == null || lng == null)) {
    return NextResponse.json({ error: "Location is required to punch in/out." }, { status: 400 });
  }
  // Tenant face-match config (kill-switch + thresholds), read once: it drives
  // the verify block, the hold-vs-reject policy, and the audit behavior.
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
    typeof fm.matchThreshold === "number" && Number.isFinite(fm.matchThreshold) ? fm.matchThreshold : 0.62;
  const reviewThreshold =
    typeof fm.reviewThreshold === "number" && Number.isFinite(fm.reviewThreshold) ? fm.reviewThreshold : 0.5;

  // Location validation when a branch geofence is configured. A mismatch no
  // longer hard-blocks: with face-match enabled the punch is HELD for admin
  // authorization (selfie + location reviewed); with the kill-switch off the
  // legacy 403 stands so the bypass stays a true bypass.
  let locationMismatch = false;
  let geofenceDistance: number | null = null;
  if (lat != null && lng != null && employee.branch && branchHasCoords) {
    geofenceDistance = distanceMeters(employee.branch.latitude!, employee.branch.longitude!, lat, lng);
    const inside = isInsideGeofence(
      employee.branch.latitude,
      employee.branch.longitude,
      employee.branch.geofenceRadius,
      lat,
      lng
    );
    if (!inside) {
      if (!faceEnabled) {
        const dist = Math.round(distanceMeters(employee.branch.latitude!, employee.branch.longitude!, lat, lng));
        return NextResponse.json(
          { error: `You are ${dist}m away from the ${employee.branch.name} geofence (${employee.branch.geofenceRadius}m allowed).` },
          { status: 403 }
        );
      }
      locationMismatch = true;
    }
  }

  const now = new Date();
  const locationStatus = !branchHasCoords || !employee.branch?.geofenceRadius || employee.branch.geofenceRadius <= 0
    ? "not_configured" : locationMismatch ? "outside" : accuracy + (geofenceDistance ?? 0) > employee.branch.geofenceRadius ? "low_accuracy" : "inside";

  // ── Face verification: uncertain results are held for human review ─────
  // Kill-switch (enabled===false) skips all face logic. No enrollment →
  // held for approval ("none"). describeFace null → "review", held for an
  // independent manager decision. verifyFace below the
  // review floor → "rejected" HELD for admin approval (no longer a 400:
  // a wrong face must be seen by a human, not silently dropped).
  // Auto-approval needs face matched AND location matched; everything else
  // goes to the review queue. Geofence/dedupe below untouched.
  let faceStatus = "none";
  let faceScore: number | null = null;
  let hasEnrollment = false;
  {
    if (faceEnabled) {
      const enrollment = await prisma.faceEnrollment.findFirst({
        where: { tenantId: employee.tenantId, employeeId: employee.id },
      });
      hasEnrollment = Boolean(enrollment);
      if (enrollment) {
        let probe: number[] | null = null;
        if (selfie) {
          try {
            const buf = selfieBytes;
            if (buf.length > 0) {
              probe = await describeFace(buf);
            }
          } catch {
            probe = null;
          }
        }
        if (!probe) {
          // ML failure or no usable descriptor requires independent review.
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
            // Corrupt/empty enrollment requires independent review.
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
              // Face mismatch: record as rejected and hold for a human —
              // silently dropping it would hide buddy-punching attempts.
              faceStatus = "rejected";
              faceScore = rounded;
            }
          }
        }
      }
    }
  }

  // Approval policy: auto-accept needs face matched AND location matched.
  // Anything else (no enrollment, outside geofence, face mismatch) is held
  // for admin authorization with a reason the queue displays.
  // Precedence for the displayed reason: location > face > enrollment.
  const holdReason = mobileHoldReason({ faceEnabled, enrolled: hasEnrollment, faceStatus, locationStatus });
  const needsApproval = holdReason !== null;

  const created = await createPunchForEvent({
      tenantId: employee.tenantId,
      employeeId: employee.id,
      source: "mobile",
      eventKey: `mobile:${employee.id}:${idempotencyKey}`,
      punchTime: now,
      inOutHint: actionHint,
      lat,
      lng,
      selfie,
      selfieCapturedAt,
      locationAccuracy: accuracy,
      locationStatus,
      geofenceDistance,
      geofenceRadius: employee.branch?.geofenceRadius ?? null,
      faceScore,
      faceStatus,
      authStatus: needsApproval ? "pending" : "auto",
      holdReason,
  });
  const punch = created.punch;
  if (!created.created) {
    if (punch.authStatus === "pending" || punch.authStatus === "declined") return NextResponse.json({ success: true, duplicate: true, pendingApproval: punch.authStatus === "pending", punch: { id: punch.id, punchTime: punch.punchTime.toISOString() } });
  }
  if (created.created) await dispatchWebhook(employee.tenantId, "punch.created", {
    employeeId: employee.id,
    punchId: punch.id,
    time: punch.punchTime.toISOString(),
    lat,
    lng,
  });

  if (punch.authStatus === "pending") {
    await appendAudit({
      tenantId: employee.tenantId,
      actorId: employee.id,
      actorRole: employee.role,
      action: "punch.held",
      entity: "Punch",
      entityId: punch.id,
      summary: `held for admin approval (${holdReason})`,
      after: { faceStatus, faceScore, holdReason },
    });
    return NextResponse.json(
      {
        success: true,
        pendingApproval: true,
        holdReason,
        punch: { id: punch.id, punchTime: punch.punchTime.toISOString() },
      },
      { status: 201 }
    );
  }

  // 2. Re-derive the day's attendance from all punches (night-shift morning
  //    outs reconcile against the previous calendar day).
  const tenant = await prisma.tenant.findUnique({ where: { id: employee.tenantId } });
  const result = await reconcileEmployeeDay(
    tenant ?? { id: employee.tenantId, config: null },
    { id: employee.id, shiftId: employee.shiftId, tenantId: employee.tenantId, branchId: employee.branchId },
    await attendanceDayForPunch(employee, punch.punchTime),
    { finalize: false }
  );

  // 3. Tell the client which transition happened.
  const isIn = result.inAt !== null && Math.abs(result.inAt.getTime() - punch.punchTime.getTime()) < 120000;
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

  // Auto-approval trail: face matched + location matched, counted without a
  // human. (Gray-zone "review" punches are trailed on their review decision;
  // held punches were trailed as punch.held above.)
  if (faceStatus === "matched") {
    await appendAudit({
      tenantId: employee.tenantId,
      actorId: employee.id,
      actorRole: employee.role,
      action: "punch.auto_accepted",
      entity: "Punch",
      entityId: punch.id,
      summary: `auto-accepted (face ${faceScore ?? "—"}, location verified)`,
      after: { faceStatus, faceScore },
    });
  }

  return NextResponse.json({ success: true, action, record, status: result.status, duplicate: !created.created }, { status: created.created ? 201 : 200 });
}
