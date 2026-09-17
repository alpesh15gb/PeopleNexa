import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { processEbioWebhookDelivery } from "@/lib/ebio-webhook";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * eBioServerNew ingestion endpoint. Every batch is staged before it reaches
 * the shared device-punch pipeline, making retries durable and idempotent.
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
    const delivery = await prisma.ebioWebhookDelivery.create({ data: { payloadHash, rawBody, recordCount } });
    const stats = await processEbioWebhookDelivery(delivery.id);
    console.info(`[eBio webhook] staged ${recordCount} record(s), punches=${stats.punches}, duplicates=${stats.duplicates}, unmatchedEmployees=${stats.unmatchedEmployees}, quarantined=${stats.quarantined}, hash=${payloadHash}`);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.ebioWebhookDelivery.findUnique({ where: { payloadHash }, select: { id: true, processedAt: true } });
      if (existing && !existing.processedAt) {
        try {
          const stats = await processEbioWebhookDelivery(existing.id);
          console.info(`[eBio webhook] retried delivery, punches=${stats.punches}, duplicates=${stats.duplicates}, unmatchedEmployees=${stats.unmatchedEmployees}, quarantined=${stats.quarantined}, hash=${payloadHash}`);
        } catch (retryError) {
          console.error("[eBio webhook] retry processing failed:", retryError);
          return new Response("Unable to process webhook delivery", { status: 500 });
        }
      } else {
        console.info(`[eBio webhook] duplicate delivery, hash=${payloadHash}`);
      }
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
