import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shifts = await prisma.shift.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { employees: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.name || !body.startTime || !body.endTime) {
      return NextResponse.json({ error: "Name, start time and end time are required." }, { status: 400 });
    }
    const name = String(body.name).trim();
    const exists = await prisma.shift.findFirst({ where: { tenantId: session.tenantId, name } });
    if (exists) return NextResponse.json({ error: "A shift with this name already exists." }, { status: 400 });

    const shift = await prisma.shift.create({
      data: {
        tenantId: session.tenantId,
        name,
        code: body.code ?? null,
        startTime: body.startTime,
        endTime: body.endTime,
        graceMinutes: Number(body.graceMinutes) || 0,
        isNightShift: Boolean(body.isNightShift),
      },
    });
    return NextResponse.json({ shift }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create shift." }, { status: 500 });
  }
}
