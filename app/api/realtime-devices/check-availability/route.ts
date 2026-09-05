import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { realtimeCapabilitiesOf } from "@/lib/realtime-devices";

// GET /api/realtime-devices/check-availability?serial=RSS…
export async function GET(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const serial = req.nextUrl.searchParams.get("serial")?.trim();
  if (!serial) return NextResponse.json({ error: "serial is required" }, { status: 400 });

  const rt = await prisma.realtimeDevice.findUnique({ where: { serialNumber: serial } });
  if (rt) {
    return NextResponse.json({
      status: rt.tenantId !== session.tenantId,
      exists: true,
      mine: rt.tenantId === session.tenantId,
      device_name: rt.tenantId === session.tenantId ? rt.name : undefined,
      supported_enroll_data: realtimeCapabilitiesOf(rt),
    });
  }
  // A serial living on another track (ESSL/eBio) is also taken.
  const essl = await prisma.device.findUnique({ where: { serialNumber: serial } });
  if (essl) return NextResponse.json({ status: false, exists: true, mine: essl.tenantId === session.tenantId });
  return NextResponse.json({ status: true, exists: false, mine: false });
}
