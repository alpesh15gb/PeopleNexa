import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const devices = await prisma.device.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { logs: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const serialNumber = String(body.serialNumber ?? "").trim();
    if (!name || !serialNumber) {
      return NextResponse.json({ error: "Name and serial number are required." }, { status: 400 });
    }
    const existing = await prisma.device.findUnique({ where: { serialNumber } });
    if (existing) {
      return NextResponse.json({ error: "A device with this serial number already exists." }, { status: 400 });
    }
    const device = await prisma.device.create({
      data: {
        tenantId: session.tenantId,
        name,
        serialNumber,
        ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null,
        type: body.type || "biometric",
        protocol: body.protocol || "attlog",
        config: {},
      },
    });
    return NextResponse.json({ device }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create device." }, { status: 500 });
  }
}
