import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIST } from "@/lib/ist";
import { handleRealtimePunch } from "@/lib/realtime-devices";

// POST /api/realtime/webhook/[code]/record — public cloud punch ingest.
// Tenant from URL code; device from device_serial/device_id; X-API-Key
// required (per-device secret minted at creation).
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const tenant = await prisma.tenant.findUnique({ where: { code } });
  if (!tenant) return NextResponse.json({ status: false, message: "Unknown workspace" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ status: false, message: "Invalid JSON body" }, { status: 400 });
  }
  const serial = String(body.device_serial ?? body.device_id ?? "").trim();
  const userId = String(body.enroll_id ?? body.user_id ?? "").trim();
  const tsRaw = String(body.timestamp ?? body.punch_time ?? "").trim();
  if (!serial || !userId || !tsRaw) {
    return NextResponse.json(
      { status: false, message: "device_serial, enroll_id and timestamp are required" },
      { status: 400 }
    );
  }
  const device = await prisma.realtimeDevice.findUnique({ where: { serialNumber: serial } });
  if (!device || device.tenantId !== tenant.id) {
    return NextResponse.json({ status: false, message: "Unknown device" }, { status: 404 });
  }
  if (req.headers.get("x-api-key") !== device.apiKey) {
    return NextResponse.json({ status: false, message: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const punchTime = parseIST(tsRaw) ?? new Date(tsRaw);
  if (Number.isNaN(punchTime.getTime())) {
    return NextResponse.json({ status: false, message: "Unparseable timestamp" }, { status: 400 });
  }
  const result = await handleRealtimePunch(device, {
    userId,
    punchTime,
    verifyMode: String(body.verify ?? body.verify_mode ?? "0"),
    inOutMode: String(body.in_out ?? "0"),
    rawLine: `webhook ${serial} ${userId} ${tsRaw}`,
  });
  await prisma.realtimeDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  if (result.action === "no_employee") {
    return NextResponse.json({ status: false, message: "Employee not found" }, { status: 404 });
  }
  return NextResponse.json({ status: true, action: result.action, logId: result.logId ?? null });
}
