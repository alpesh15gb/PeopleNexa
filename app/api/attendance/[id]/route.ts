import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["present", "late", "permission", "absent", "half_day"];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ record });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();

  const record = await prisma.attendance.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!ALLOWED.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.note !== undefined) data.note = body.note || null;
  if (body.punchInTime) data.punchInTime = new Date(body.punchInTime);
  if (body.punchOutTime) data.punchOutTime = new Date(body.punchOutTime);
  if (body.punchOutTime === null) data.punchOutTime = null;

  const updated = await prisma.attendance.update({ where: { id }, data });
  return NextResponse.json({ record: updated });
}
