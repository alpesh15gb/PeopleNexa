import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceUnauthorizedResponse, verifyDeviceRequest } from "@/lib/device-auth";

// POST /iclock/devicecmd?key=... — device reports command result.
export async function POST(req: NextRequest) {
  if (!verifyDeviceRequest(req)) return deviceUnauthorizedResponse();

  try {
    const text = await req.text();
    let id: string | null = null;
    let ret: string | null = null;

    if (text && text.includes("=")) {
      const params = new URLSearchParams(text);
      id = params.get("ID");
      ret = params.get("Return");
    }
    if (!id) id = req.nextUrl.searchParams.get("ID");
    if (ret === null) ret = req.nextUrl.searchParams.get("Return");

    if (id) {
      await prisma.deviceCommand.updateMany({
        where: { id, status: { in: ["pending", "sent"] } },
        data: {
          status: ret === "0" ? "executed" : "failed",
          response: text || "",
          updatedAt: new Date(),
        },
      });
    }
  } catch (err) {
    console.error("[iClock] devicecmd error:", err);
    return new NextResponse("ERROR\r\n", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
