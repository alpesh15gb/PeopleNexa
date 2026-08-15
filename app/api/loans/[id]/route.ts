import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const loan = await prisma.employeeLoan.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const updated = await prisma.employeeLoan.update({
    where: { id },
    data: body.status === "closed" ? { status: "closed" } : {},
  });
  return NextResponse.json({ loan: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const loan = await prisma.employeeLoan.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  await prisma.employeeLoan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
