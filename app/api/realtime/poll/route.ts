import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/realtime/poll?serial=…&apiKey=… — JSON command pickup for
// wss/fkweb devices (twin of /iclock/getrequest for ADMS).
export async function GET(req: NextRequest) {
  const serial = req.nextUrl.searchParams.get("serial")?.trim();
  const apiKey = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("apiKey");
  if (!serial) return NextResponse.json({ error: "serial is required" }, { status: 400 });

  const device = await prisma.realtimeDevice.findUnique({ where: { serialNumber: serial } });
  if (!device) return NextResponse.json({ commands: [] });
  if (device.apiKey !== apiKey) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  await prisma.realtimeDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date(), status: "active" },
  });
  const pending = await prisma.realtimeCommand.findMany({
    where: { realtimeDeviceId: device.id, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (pending.length > 0) {
    await prisma.realtimeCommand.updateMany({
      where: { id: { in: pending.map((c) => c.id) } },
      data: { status: "sent" },
    });
  }
  return NextResponse.json({
    commands: pending.map((c) => ({ id: c.id, command: c.command, createdAt: c.createdAt })),
    server_time: new Date().toISOString(),
  });
}
