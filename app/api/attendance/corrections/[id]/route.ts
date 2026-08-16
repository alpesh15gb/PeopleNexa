import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, isFinalizable, shiftWindow } from "@/lib/reconcile";
import { notifyEmployee } from "@/lib/notifications";

/** PATCH — admin approves or rejects a pending correction. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be approved or rejected." }, { status: 400 });
  }

  const correction = await prisma.punchCorrection.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!correction) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (correction.status !== "pending") {
    return NextResponse.json({ error: "This correction was already reviewed." }, { status: 400 });
  }

  if (status === "rejected") {
    const updated = await prisma.punchCorrection.update({
      where: { id },
      data: {
        status: "rejected",
        reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
        reviewedBy: session.sub,
        reviewedAt: new Date(),
      },
    });
    await notifyEmployee(
      correction.tenantId,
      correction.employeeId,
      "danger",
      "Punch correction rejected",
      `Your punch correction for ${correction.date.toISOString().slice(0, 10)} was rejected.`
    );
    return NextResponse.json({ correction: updated });
  }

  // Approve → apply the requested times to the punch ledger (source
  // "correction"), then re-derive. Editing punches — not the attendance row —
  // is what keeps the corrected times consistent: reconcile recomputes in/out
  // from the punch table, so patching attendance alone would be clobbered.
  const employee = await prisma.employee.findUnique({
    where: { id: correction.employeeId },
    select: { id: true, shiftId: true, tenantId: true, branchId: true, shift: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "The employee no longer exists." }, { status: 404 });
  }

  const { start: windowStart, end: windowEnd } = shiftWindow(correction.date, employee.shift);
  const punches = await prisma.punch.findMany({
    where: { employeeId: correction.employeeId, punchTime: { gte: windowStart, lt: windowEnd } },
    orderBy: { punchTime: "asc" },
    select: { id: true },
  });
  const firstId = punches[0]?.id ?? null;
  const lastId = punches[punches.length - 1]?.id ?? null;

  if (correction.requestedIn && correction.requestedOut && punches.length === 1) {
    // A single recorded punch plus both corrections → that punch is the "in";
    // the "out" is genuinely missing, so add it as a new corrected punch.
    await prisma.punch.update({
      where: { id: firstId! },
      data: { punchTime: correction.requestedIn },
    });
    await prisma.punch.create({
      data: {
        tenantId: session.tenantId,
        employeeId: correction.employeeId,
        source: "correction",
        punchTime: correction.requestedOut,
        inOutHint: "out",
      },
    });
  } else {
    if (correction.requestedIn) {
      if (firstId) {
        await prisma.punch.update({ where: { id: firstId }, data: { punchTime: correction.requestedIn } });
      } else {
        await prisma.punch.create({
          data: {
            tenantId: session.tenantId,
            employeeId: correction.employeeId,
            source: "correction",
            punchTime: correction.requestedIn,
            inOutHint: "in",
          },
        });
      }
    }
    if (correction.requestedOut) {
      // With a lone punch, that punch is the "in" — the requested out is new.
      if (lastId && lastId !== firstId) {
        await prisma.punch.update({ where: { id: lastId }, data: { punchTime: correction.requestedOut } });
      } else {
        await prisma.punch.create({
          data: {
            tenantId: session.tenantId,
            employeeId: correction.employeeId,
            source: "correction",
            punchTime: correction.requestedOut,
            inOutHint: "out",
          },
        });
      }
    }
  }

  // Re-run reconciliation so status / late minutes / overtime reflect the
  // corrected times and the day locks at its corrected values.
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  await reconcileEmployeeDay(
    tenant ?? { id: session.tenantId, config: null },
    employee,
    correction.date,
    { finalize: isFinalizable(correction.date, undefined, employee.shift) }
  );

  const updated = await prisma.punchCorrection.update({
    where: { id },
    data: {
      status: "approved",
      reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
      reviewedBy: session.sub,
      reviewedAt: new Date(),
    },
  });

  await notifyEmployee(
    correction.tenantId,
    correction.employeeId,
    "success",
    "Punch correction approved",
    `Your punch correction for ${correction.date.toISOString().slice(0, 10)} was approved.`
  );

  return NextResponse.json({ correction: updated });
}
