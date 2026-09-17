import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Receive-only eBioServerNew staging endpoint. No DeviceLog, Punch, or
 * Attendance rows are written here; processing is deliberately separate.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  let recordCount = 0;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    recordCount = Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    // Preserve malformed vendor payloads for review instead of discarding them.
  }

  try {
    await prisma.ebioWebhookDelivery.create({ data: { payloadHash, rawBody, recordCount } });
    console.info(`[eBio webhook] staged ${recordCount} record(s), hash=${payloadHash}`);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      console.info(`[eBio webhook] duplicate delivery, hash=${payloadHash}`);
    } else {
      console.error("[eBio webhook] staging failed:", error);
      return new Response("Unable to stage webhook delivery", { status: 500 });
    }
  }

  return new Response("Success", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
