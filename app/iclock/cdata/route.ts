import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIST } from "@/lib/ist";
import { handleDevicePunch } from "@/lib/iclock";

async function findDevice(sn: string) {
  return prisma.device.findUnique({ where: { serialNumber: sn } });
}

async function touch(deviceId: string) {
  await prisma.device.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), status: "active" },
  });
}

// GET /iclock/cdata?SN=...&options=all — device registration + config pull.
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!sn) return new NextResponse("ERROR: No serial number", { status: 400 });

  const device = await findDevice(sn);
  if (!device) {
    // DeviceLog requires a deviceId FK + tenantId, so an unknown SN cannot be
    // persisted as a DeviceLog row (tenant is unresolvable). Keep an
    // admin-visible server alert instead.
    // TODO: add a tenant-less/global alert store so admins can see unknown-SN probes in the UI.
    console.warn(`[iClock] Unknown device: ${sn}`);
    return new NextResponse("OK", { headers: { "Content-Type": "text/plain" } });
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
    return new NextResponse(config, { headers: { "Content-Type": "text/plain" } });
  }

  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
}

// POST /iclock/cdata?SN=...&table=ATTLOG — device pushes tab-delimited punch logs.
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN");
  if (!sn) return new NextResponse("ERROR: No SN", { status: 400 });

  const device = await findDevice(sn);
  if (!device) {
    // Same constraint as GET: no device row → no tenant → cannot create a
    // DeviceLog (deviceId FK required). Warn loudly but still answer OK so the
    // device keeps pushing.
    // TODO: persist unknown-SN pushes to a global alert store for admin visibility.
    console.warn(`[iClock] POST from unknown device: ${sn}`);
    return new NextResponse("OK: 0\r\n", { headers: { "Content-Type": "text/plain" } });
  }

  await touch(device.id);

  if (req.nextUrl.searchParams.get("table") === "OPERLOG") {
    return new NextResponse("OK: 0\r\n", { headers: { "Content-Type": "text/plain" } });
  }

  const rawBody = await req.text();
  if (!rawBody || rawBody.trim().length === 0) {
    // Empty heartbeat POST.
    return new NextResponse("OK: 0\r\n", { headers: { "Content-Type": "text/plain" } });
  }

  // Format per line: userId \t dateTime \t verifyMode \t inOutMode \t workCode
  const lines = rawBody.split("\n").filter((l) => l.trim());
  let accepted = 0;

  for (const line of lines) {
    try {
      let parts = line.split("\t");
      if (parts.length < 2) parts = line.split(/\s+/).filter((p) => p.trim());
      if (parts.length < 2) continue;

      const userId = parts[0].trim();
      const dateTimeStr = parts[1] + (parts[1].length < 11 && parts[2] ? " " + parts[2] : "");
      const verifyMode = parts[3]?.trim() || "0";
      const inOutMode = parts[4]?.trim() || "0";

      if (!userId || !dateTimeStr) continue;

      const punchTime = parseIST(dateTimeStr);
      if (!punchTime) {
        console.log(`[iClock] Unparseable date: ${dateTimeStr}`);
        continue;
      }

      const result = await handleDevicePunch(device, {
        userId,
        punchTime,
        verifyMode,
        inOutMode,
        rawLine: line,
      });
      if (result.accepted) accepted++;
      console.log(`[iClock] ${sn} emp=${userId} ${dateTimeStr} → ${result.action}`);
    } catch (err) {
      console.error(`[iClock] Line error: ${line}`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[iClock] Device ${sn}: accepted ${accepted}/${lines.length} records`);
  return new NextResponse(`OK: ${accepted}\r\n`, { headers: { "Content-Type": "text/plain" } });
}
