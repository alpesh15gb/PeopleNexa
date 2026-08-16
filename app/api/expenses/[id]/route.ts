import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notifyEmployee } from "@/lib/notifications";

const FLOW = ["approved", "rejected", "settled"] as const;

/** PATCH — admin approves / rejects / settles a claim. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!FLOW.includes(status)) {
    return NextResponse.json({ error: "status must be approved, rejected or settled." }, { status: 400 });
  }

  const claim = await prisma.expenseClaim.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const data: Record<string, unknown> = {
    status,
    reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
    reviewedBy: session.sub,
    reviewedAt: new Date(),
  };
  if (status === "settled") data.settledAt = new Date();

  const updated = await prisma.expenseClaim.update({ where: { id }, data });

  await notifyEmployee(
    claim.tenantId,
    claim.employeeId,
    status === "rejected" ? "danger" : "success",
    `Expense claim ${status}`,
    `${claim.title} (₹${claim.amount}) was ${status}.`
  );

  return NextResponse.json({ claim: updated });
}

/** DELETE — admin removes a claim (e.g. duplicate). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const claim = await prisma.expenseClaim.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  await prisma.expenseClaim.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
