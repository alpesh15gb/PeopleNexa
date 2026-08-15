import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /iclock/devicecmd — device reports a command result (ID=...&Return=0).
export async function POST(req: NextRequest) {
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
        where: { id },
        data: {
          status: ret === "0" ? "executed" : "failed",
          response: text || "",
          updatedAt: new Date(),
        },
      });
      console.log(`[iClock] Command ${id} response: ${ret}`);
    }
  } catch (err) {
    console.error("[iClock] devicecmd error:", err);
  }
  return new NextResponse("OK\r\n", { headers: { "Content-Type": "text/plain" } });
}
