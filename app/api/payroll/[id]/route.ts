import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const status = String(body.status ?? "");
  if (!["draft", "paid"].includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const payslip = await prisma.payslip.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!payslip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.payslip.update({
    where: { id },
    data: { status, note: body.note ?? payslip.note },
  });
  return NextResponse.json({ payslip: updated });
}
