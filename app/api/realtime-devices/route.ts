import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { REALTIME_CAPABILITIES, REALTIME_PROTOCOLS, mintRealtimeApiKey } from "@/lib/realtime-devices";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const devices = await prisma.realtimeDevice.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { logs: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ devices: devices.map((d) => ({ ...d, apiKey: undefined })) });
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
    const protocol = (REALTIME_PROTOCOLS as readonly string[]).includes(String(body.protocol))
      ? String(body.protocol)
      : "wss";
    const existing =
      (await prisma.realtimeDevice.findUnique({ where: { serialNumber } })) ??
      (await prisma.device.findUnique({ where: { serialNumber } }));
    if (existing) {
      return NextResponse.json({ error: "A device with this serial number already exists." }, { status: 400 });
    }
    const capabilities =
      Array.isArray(body.capabilities) && body.capabilities.length > 0
        ? (body.capabilities as unknown[]).map(String)
        : [...REALTIME_CAPABILITIES];
    const device = await prisma.realtimeDevice.create({
      data: {
        tenantId: session.tenantId,
        name,
        serialNumber,
        productName: body.productName ? String(body.productName).trim() : null,
        protocol,
        capabilities,
        apiKey: mintRealtimeApiKey(),
        ipAddress: body.ipAddress ? String(body.ipAddress).trim() : null,
        config: {},
      },
    });
    // apiKey is shown once at creation (copy it into the machine).
    return NextResponse.json({ device }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create realtime device." }, { status: 500 });
  }
}
