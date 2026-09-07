import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";
import { formatDate } from "@/lib/dates";
import { dispatchWebhook } from "@/lib/webhooks";
import { sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const decision = String(body.status ?? "");
  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  const reviewNote = body.note || null;
  const reviewedAt = new Date();

  if (decision === "rejected") {
    // Atomic claim: only a pending row can transition to rejected.
    const claimed = await prisma.leaveRequest.updateMany({
      where: { id, tenantId: session.tenantId, status: "pending" },
      data: { status: "rejected", reviewedBy: session.sub, reviewedAt, reviewNote },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
    }
    const updated = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { leaveType: true },
    });
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

    await notifyEmployee(
      session.tenantId,
      request.employeeId,
      "danger",
      "Leave rejected",
      `Your ${updated.leaveType.name} (${formatDate(updated.fromDate)} → ${formatDate(updated.toDate)}) was rejected.`
    );

    const employee = await prisma.employee.findUnique({
      where: { id: request.employeeId },
      select: { phone: true, firstName: true },
    });
    const admin = await prisma.employee.findUnique({ where: { id: session.sub }, select: { firstName: true } });
    await sendWhatsApp(session.tenantId, employee?.phone, "leave.rejected", {
      from: formatDate(updated.fromDate),
      to: formatDate(updated.toDate),
      admin: admin?.firstName ?? "HR",
      reason: body.note || "—",
    });

    return NextResponse.json({ request: updated });
  }

  // Approve: claim the pending row first (count==0 → a concurrent reviewer
  // won → 409), then re-check the balance including this request. Throwing
  // on over-balance rolls the claim back so the request stays pending.
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.leaveRequest.updateMany({
        where: { id, tenantId: session.tenantId, status: "pending" },
        data: { status: "approved", reviewedBy: session.sub, reviewedAt, reviewNote },
      });
      if (claimed.count === 0) {
        const err = new Error("This request has already been reviewed.") as Error & { code?: string };
        err.code = "CLAIM_CONFLICT";
        throw err;
      }
      const [approvedRows, leaveType] = await Promise.all([
        tx.leaveRequest.findMany({
          where: {
            tenantId: session.tenantId,
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            status: "approved",
          },
          select: { days: true },
        }),
        tx.leaveType.findUnique({ where: { id: request.leaveTypeId } }),
      ]);
      const total = approvedRows.reduce((sum, r) => sum + r.days, 0);
      if (leaveType && total > leaveType.maxDays) {
        const err = new Error(
          `Approving this would exceed the ${leaveType.name} balance — ${leaveType.maxDays} day(s) allowed, ${total} day(s) would be approved.`
        ) as Error & { code?: string };
        err.code = "OVER_BALANCE";
        throw err;
      }
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "CLAIM_CONFLICT") {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
    if (code === "OVER_BALANCE") {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    throw e;
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true },
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await notifyEmployee(
    session.tenantId,
    request.employeeId,
    "success",
    "Leave approved",
    `Your ${updated.leaveType.name} (${formatDate(updated.fromDate)} → ${formatDate(updated.toDate)}) was approved.`
  );

  await dispatchWebhook(session.tenantId, "leave.approved", {
    requestId: request.id,
    employeeId: request.employeeId,
    leaveType: updated.leaveType.name,
    fromDate: formatDate(updated.fromDate),
    toDate: formatDate(updated.toDate),
    days: updated.days,
  });

  const employee = await prisma.employee.findUnique({
    where: { id: request.employeeId },
    select: { phone: true, firstName: true },
  });
  const admin = await prisma.employee.findUnique({ where: { id: session.sub }, select: { firstName: true } });
  await sendWhatsApp(session.tenantId, employee?.phone, "leave.approved", {
    from: formatDate(updated.fromDate),
    to: formatDate(updated.toDate),
    admin: admin?.firstName ?? "HR",
    reason: body.note || "—",
  });

  return NextResponse.json({ request: updated });
}
