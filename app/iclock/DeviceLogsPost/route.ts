import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIST } from "@/lib/ist";
import { handleDevicePunch } from "@/lib/iclock";

// POST /iclock/DeviceLogsPost — AI devices push JSON logs:
// { TableName: "ATTLOG", Rec: [ { ENROLLNO, ATT_TIME, VerifyCode, SN, ... } ] }
export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ Code: 200, Message: "OK" });
    }

    const data = Array.isArray(body) ? body : (body as { Rec?: unknown[] })?.Rec ?? body;
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ Code: 200, Message: "OK" });
    }

    let accepted = 0;
    for (const record of data as Record<string, unknown>[]) {
      try {
        const userId = String(record.ENROLLNO ?? record.EmployeeId ?? "").trim();
        const dateTimeStr = String(record.ATT_TIME ?? record.PunchTime ?? "").trim();
        const deviceSn = String(record.SN ?? record.DeviceSerial ?? "").trim();
        const verifyMode = String(record.VerifyCode ?? record.VerifyMode ?? "0");
        const inOutMode = String(record.InOutMode ?? record.State ?? "0");

        if (!userId || !dateTimeStr) continue;

        const sn = req.nextUrl.searchParams.get("SN") || deviceSn;
        const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
        if (!device) {
          console.log(`[iClock][AI] Unknown device: ${sn}`);
          continue;
        }

        await prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(), status: "active" },
        });

        const punchTime = parseIST(dateTimeStr);
        if (!punchTime) continue;

        const result = await handleDevicePunch(device, {
          userId,
          punchTime,
          verifyMode,
          inOutMode,
          rawLine: JSON.stringify(record),
        });
        if (result.accepted) accepted++;
      } catch (err) {
        console.error("[iClock][AI] Record error:", err instanceof Error ? err.message : err);
      }
    }

    console.log(`[iClock][AI] Processed ${accepted} records`);
    return NextResponse.json({ Code: 200, Message: `Processed ${accepted} records` });
  } catch (err) {
    console.error("[iClock][AI] Error:", err);
    return NextResponse.json({ Code: 500, Message: "Error" }, { status: 500 });
  }
}
