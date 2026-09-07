import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /iclock/devicecmd — device reports a command result (ID=...&Return=0).
// The command ID is bound to the reporting SN: a result is only recorded when
// the command actually belongs to that device. Always answers OK (protocol).
export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    let id: string | null = null;
    let ret: string | null = null;
    let snBody: string | null = null;

    if (text && text.includes("=")) {
      const params = new URLSearchParams(text);
      id = params.get("ID");
      ret = params.get("Return");
      snBody = params.get("SN");
    }
    if (!id) id = req.nextUrl.searchParams.get("ID");
    if (ret === null) ret = req.nextUrl.searchParams.get("Return");
    const sn = req.nextUrl.searchParams.get("SN") ?? snBody;

    if (!sn || !id) return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });

    const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
    if (!device) return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });

    const cmd = await prisma.deviceCommand.findUnique({ where: { id } });
    if (!cmd || cmd.deviceId !== device.id) {
      // Unknown id or cross-device report — OK without any write.
      return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
    }

    const retNorm = ret === null ? null : ret.trim();
    if (retNorm === null || retNorm === "") {
      // Missing/empty Return: device hasn't reported yet — stay "sent".
      await prisma.deviceCommand.update({
        where: { id },
        data: { status: "sent", response: text || "", updatedAt: new Date() },
      });
    } else {
      await prisma.deviceCommand.update({
        where: { id },
        data: {
          status: retNorm === "0" ? "executed" : "failed",
          response: text || "",
          updatedAt: new Date(),
        },
      });
    }
    console.log(`[iClock] Command ${id} response: ${ret}`);
  } catch (err) {
    console.error("[iClock] devicecmd error:", err);
  }
  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
}
