import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** DELETE — remove a manual adjustment (admin). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const adjustment = await prisma.payrollAdjustment.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!adjustment) return NextResponse.json({ error: "Adjustment not found." }, { status: 404 });
  await prisma.payrollAdjustment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
