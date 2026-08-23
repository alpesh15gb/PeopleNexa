import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceUnauthorizedResponse, verifyDeviceRequest } from "@/lib/device-auth";

// GET /iclock/getrequest?key=...&SN=... — device polls for pending commands.
export async function GET(req: NextRequest) {
  if (!verifyDeviceRequest(req)) return deviceUnauthorizedResponse();

  const sn = req.nextUrl.searchParams.get("SN")?.trim();
  if (!sn) return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });

  const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
  if (!device || device.status === "inactive") {
    return new NextResponse("ERROR: unknown device\r\n", { status: 404, headers: { "Content-Type": "text/plain" } });
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
    const payload = `C:${cmd.id}:${cmd.command}\r\n`;
    await prisma.deviceCommand.update({ where: { id: cmd.id }, data: { status: "sent" } });
    return new NextResponse(payload, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }

  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
