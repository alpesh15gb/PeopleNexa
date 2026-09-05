import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { reconcileEmployeeDay, isFinalizable, shiftWindow } from "@/lib/reconcile";
import { istStartOfDay } from "@/lib/ist";
import { notifyEmployee } from "@/lib/notifications";

/** PATCH — admin approves or rejects a pending correction. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
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

  const { start: windowStart, end: windowEnd } = shiftWindow(istStartOfDay(correction.date), employee.shift);
  // Validate requested times: in < out, within the shift window, not future.
  const now = new Date();
  if (correction.requestedIn && correction.requestedOut && correction.requestedIn.getTime() >= correction.requestedOut.getTime()) {
    return NextResponse.json({ error: "Requested in-time must be before out-time." }, { status: 400 });
  }
  for (const [label, t] of [["requestedIn", correction.requestedIn], ["requestedOut", correction.requestedOut]] as const) {
    if (!t) continue;
    if (t.getTime() > now.getTime()) {
      return NextResponse.json({ error: `${label} cannot be in the future.` }, { status: 400 });
    }
    if (t.getTime() < windowStart.getTime() || t.getTime() >= windowEnd.getTime()) {
      return NextResponse.json({ error: `${label} is outside the shift window for that day.` }, { status: 400 });
    }
  }

  const punches = await prisma.punch.findMany({
    where: { employeeId: correction.employeeId, punchTime: { gte: windowStart, lt: windowEnd } },
    orderBy: { punchTime: "asc" },
    select: { id: true, punchTime: true, inOutHint: true },
  });
  const firstId = punches[0]?.id ?? null;
  const lastId = punches[punches.length - 1]?.id ?? null;
  // Lone-punch type: a single punch with hint "out" is a real out (missed in),
  // otherwise treat it as the "in" (first_last pairs a lone punch as in).
  const loneIsOut = punches.length === 1 && punches[0].inOutHint === "out";

  // Apply punch edits atomically so concurrent approvals can't interleave
  // creates and leave duplicate out punches. Reconciliation runs after the
  // transaction commits (it reads the committed punch ledger).
  await prisma.$transaction(async (tx) => {
    if (correction.requestedIn && correction.requestedOut && punches.length === 1) {
      if (loneIsOut) {
        // Lone out + both corrections → that punch is the "out"; the "in" is missing.
        await tx.punch.update({
          where: { id: firstId! },
          data: { punchTime: correction.requestedOut },
        });
        await tx.punch.create({
          data: {
            tenantId: session.tenantId,
            employeeId: correction.employeeId,
            source: "correction",
            punchTime: correction.requestedIn,
            inOutHint: "in",
          },
        });
      } else {
        // A single recorded punch plus both corrections → that punch is the "in";
        // the "out" is genuinely missing, so add it as a new corrected punch.
        await tx.punch.update({
          where: { id: firstId! },
          data: { punchTime: correction.requestedIn },
        });
        await tx.punch.create({
          data: {
            tenantId: session.tenantId,
            employeeId: correction.employeeId,
            source: "correction",
            punchTime: correction.requestedOut,
            inOutHint: "out",
          },
        });
      }
    } else {
      if (correction.requestedIn) {
        // With a lone out punch, the requested in is new — don't overwrite the out.
        if (firstId && !loneIsOut) {
          await tx.punch.update({ where: { id: firstId }, data: { punchTime: correction.requestedIn } });
        } else {
          await tx.punch.create({
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
        // Exception: the lone punch is already an "out", so update it in place
        // instead of creating a duplicate out.
        if (lastId && (lastId !== firstId || loneIsOut)) {
          await tx.punch.update({ where: { id: lastId }, data: { punchTime: correction.requestedOut } });
        } else {
          await tx.punch.create({
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

    // A reviewed correction is authoritative. Reopen a previously finalized
    // derived row so reconciliation cannot return the old locked values.
    await tx.attendance.updateMany({
      where: {
        tenantId: session.tenantId,
        employeeId: correction.employeeId,
        date: { gte: windowStart, lt: windowEnd },
      },
      data: { finalized: false, reviewStatus: null },
    });
  });

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
