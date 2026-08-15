import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";
import { formatDate } from "@/lib/dates";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
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

  return NextResponse.json({ request: updated });
}
