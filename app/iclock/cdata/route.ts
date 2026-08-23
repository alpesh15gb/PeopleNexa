import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIST } from "@/lib/ist";
import { handleDevicePunch, parseAttlogLine } from "@/lib/iclock";
import { deviceUnauthorizedResponse, verifyDeviceRequest } from "@/lib/device-auth";

async function findDevice(sn: string) {
  return prisma.device.findUnique({ where: { serialNumber: sn } });
}

async function touch(deviceId: string) {
  await prisma.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), status: "active" },
  });
}

// GET /iclock/cdata?key=...&SN=...&options=all — registration/config pull.
export async function GET(req: NextRequest) {
  if (!verifyDeviceRequest(req)) return deviceUnauthorizedResponse();

  const sn = req.nextUrl.searchParams.get("SN")?.trim();
  if (!sn) return new NextResponse("ERROR: No serial number", { status: 400 });

  const device = await findDevice(sn);
  if (!device || device.status === "inactive") {
    console.warn(`[iClock] Rejected unknown/inactive device: ${sn}`);
    return new NextResponse("ERROR: unknown device\r\n", { status: 404 });
  }

  await touch(device.id);

  if (req.nextUrl.searchParams.get("options") === "all") {
    const config = [
      `GET OPTION FROM: ${sn}`,
      "Registry=1",
      "Stamp=1",
      "OpStamp=1",
      "PhotoStamp=1",
      "ErrorDelay=60",
      "Delay=30",
      "TransTimes=00:00;14:05",
      "TransInterval=1",
      "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tEnrollFP\tFPImag",
      "ServerVer=2.4.1",
      "ATTLOGStamp=0",
      "OPERLOGStamp=0",
    ].join("\r\n") + "\r\n";
    return new NextResponse(config, {
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  return new NextResponse("OK\r\n", {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

// POST /iclock/cdata?key=...&SN=...&table=ATTLOG — tab-delimited punches.
export async function POST(req: NextRequest) {
  if (!verifyDeviceRequest(req)) return deviceUnauthorizedResponse();

  const sn = req.nextUrl.searchParams.get("SN")?.trim();
  if (!sn) return new NextResponse("ERROR: No SN", { status: 400 });

  const device = await findDevice(sn);
  if (!device || device.status === "inactive") {
    console.warn(`[iClock] POST rejected for unknown/inactive device: ${sn}`);
    return new NextResponse("ERROR: unknown device\r\n", { status: 404 });
  }

  await touch(device.id);

  if (req.nextUrl.searchParams.get("table") === "OPERLOG") {
    return new NextResponse("OK: 0\r\n", { headers: { "Content-Type": "text/plain" } });
  }

  const rawBody = await req.text();
  if (!rawBody || rawBody.trim().length === 0) {
    return new NextResponse("OK: 0\r\n", { headers: { "Content-Type": "text/plain" } });
  }

  const lines = rawBody.split(/\r?\n/).filter((l) => l.trim());
  let accepted = 0;

  for (const line of lines) {
    try {
      const parsed = parseAttlogLine(line);
      if (!parsed) {
        console.warn(`[iClock] Malformed ATTLOG line from ${sn}`);
        continue;
      }

      const punchTime = parseIST(parsed.dateTime);
      if (!punchTime) {
        console.warn(`[iClock] Unparseable ATTLOG timestamp from ${sn}: ${parsed.dateTime}`);
        continue;
      }

      const result = await handleDevicePunch(device, {
        userId: parsed.userId,
        punchTime,
        verifyMode: parsed.verifyMode,
        inOutMode: parsed.inOutMode,
        rawLine: line,
      });
      if (result.accepted) accepted++;
    } catch (err) {
      console.error(`[iClock] ATTLOG line error from ${sn}:`, err instanceof Error ? err.message : err);
    }
  }

  return new NextResponse(`OK: ${accepted}\r\n`, {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
