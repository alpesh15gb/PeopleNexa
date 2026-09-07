import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /iclock/getrequest?SN=... — device polls for pending commands.
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!sn) return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });

  const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
  if (device) {
    if (device.status === "inactive") {
      // Retired device: empty OK without touching lastSeenAt/status.
      return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
    }
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), status: "active" },
    });

    const cmd = await prisma.deviceCommand.findFirst({
      where: { deviceId: device.id, status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    if (cmd) {
      // Race-safe claim: only the poller that flips pending→sent delivers it.
      const claimed = await prisma.deviceCommand.updateMany({
        where: { id: cmd.id, status: "pending" },
        data: { status: "sent" },
      });
      if (claimed.count !== 1) {
        // Lost the race — another poller already took it.
        return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
      }
      const payload = `C:${cmd.id}:${cmd.command}\r\n`;
      console.log(`[iClock] Sending command to ${sn}: ${payload.trim()}`);
      return new NextResponse(payload, { headers: { "Content-Type": "text/plain" } });
    }
  }

  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
}
