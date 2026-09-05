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
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: decision, reviewedBy: session.sub, reviewedAt: new Date(), reviewNote: body.note || null },
    include: { leaveType: true },
  });

  await notifyEmployee(
    session.tenantId,
    request.employeeId,
    decision === "approved" ? "success" : "danger",
    decision === "approved" ? "Leave approved" : "Leave rejected",
    `Your ${updated.leaveType.name} (${formatDate(updated.fromDate)} → ${formatDate(updated.toDate)}) was ${decision}.`
  );

  if (decision === "approved") {
    await dispatchWebhook(session.tenantId, "leave.approved", {
      requestId: request.id,
      employeeId: request.employeeId,
      leaveType: updated.leaveType.name,
      fromDate: formatDate(updated.fromDate),
      toDate: formatDate(updated.toDate),
      days: updated.days,
    });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: request.employeeId },
    select: { phone: true, firstName: true },
  });
  const admin = await prisma.employee.findUnique({ where: { id: session.sub }, select: { firstName: true } });
  await sendWhatsApp(session.tenantId, employee?.phone, decision === "approved" ? "leave.approved" : "leave.rejected", {
    from: formatDate(updated.fromDate),
    to: formatDate(updated.toDate),
    admin: admin?.firstName ?? "HR",
    reason: body.note || "—",
  });

  return NextResponse.json({ request: updated });
}
