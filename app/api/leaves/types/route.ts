import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const types = await prisma.leaveType.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ types });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.name || !body.code || !body.maxDays) {
      return NextResponse.json({ error: "Name, code and max days are required." }, { status: 400 });
    }
    const code = String(body.code).toUpperCase();
    const exists = await prisma.leaveType.findFirst({ where: { tenantId: session.tenantId, code } });
    if (exists) return NextResponse.json({ error: "A leave type with this code already exists." }, { status: 400 });

    const type = await prisma.leaveType.create({
      data: {
        tenantId: session.tenantId,
        name: body.name,
        code,
        maxDays: Number(body.maxDays),
        isCarryForward: Boolean(body.isCarryForward),
        requiresApproval: body.requiresApproval !== false,
        color: body.color || "#3b82f6",
      },
    });
    return NextResponse.json({ type }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create leave type." }, { status: 500 });
  }
}
