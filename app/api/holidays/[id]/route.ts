import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const holiday = await prisma.holiday.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!holiday) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.holiday.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
