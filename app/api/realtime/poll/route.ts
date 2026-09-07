import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/realtime/poll?serial=… — JSON command pickup for
// wss/fkweb devices (twin of /iclock/getrequest for ADMS).
// Auth is header-only (X-API-Key); unknown serial and wrong key share one
// uniform 401 so poll responses never oracle device existence.
export async function GET(req: NextRequest) {
  const serial = req.nextUrl.searchParams.get("serial")?.trim();
  const apiKey = req.headers.get("x-api-key");
  if (!serial) return NextResponse.json({ error: "serial is required" }, { status: 400 });

  const device = await prisma.realtimeDevice.findUnique({ where: { serialNumber: serial } });
  if (!device || device.apiKey !== apiKey) {
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
    // Best-effort atomic claim: only flip rows still pending, and check how
    // many this poller actually won (a concurrent poller may take some).
    const claimed = await prisma.realtimeCommand.updateMany({
      where: { id: { in: pending.map((c) => c.id) }, realtimeDeviceId: device.id, status: "pending" },
      data: { status: "sent" },
    });
    if (claimed.count !== pending.length) {
      console.warn(
        `[realtime] poll race for ${serial}: claimed ${claimed.count}/${pending.length} pending commands`
      );
    }
  }
  return NextResponse.json({
    commands: pending.map((c) => ({ id: c.id, command: c.command, createdAt: c.createdAt })),
    server_time: new Date().toISOString(),
  });
}
