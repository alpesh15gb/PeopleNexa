import { createHmac } from "crypto";
import { prisma } from "./prisma";

/**
 * Outbound webhooks — fire tenant-configured endpoints on domain events.
 * Payloads are signed with HMAC-SHA256 (X-PeopleNexa-Signature) so receivers
 * can verify authenticity. Delivery is fire-and-forget (never blocks the
 * request that triggered it).
 */

export const WEBHOOK_EVENTS = [
  "punch.created",
  "attendance.finalized",
  "leave.approved",
  "expense.created",
  "employee.created",
  "ticket.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export async function dispatchWebhook(tenantId: string, event: WebhookEvent, payload: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId, active: true },
      select: { id: true, url: true, events: true, secret: true },
    });
    const targets = endpoints.filter((ep) => ep.events.split(",").map((s) => s.trim()).includes(event));
    for (const ep of targets) {
      // Fire-and-forget: failures never block or crash the caller.
      void fire(ep.url, ep.secret, event, payload).catch(() => {});
    }
  } catch {
    // never throw — webhooks are best-effort
  }
}

async function fire(url: string, secret: string, event: WebhookEvent, payload: unknown): Promise<void> {
  const body = JSON.stringify({ event, at: new Date().toISOString(), payload });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PeopleNexa-Event": event,
      "X-PeopleNexa-Signature": `sha256=${sig}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
}
