import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Direct ADMS/iClock endpoints are intentionally outside the browser session
 * model, so they require a deployment-level secret. Devices may send it as a
 * query parameter (legacy firmware) or header (modern gateways).
 */
export function verifyDeviceRequest(req: NextRequest): boolean {
  const expected = process.env.DEVICE_INGEST_SECRET?.trim();
  // Fail closed in production. Local development remains convenient.
  if (!expected) return process.env.NODE_ENV !== "production";

  const supplied =
    req.headers.get("x-device-secret")?.trim() ||
    req.nextUrl.searchParams.get("key")?.trim() ||
    req.nextUrl.searchParams.get("auth")?.trim() ||
    "";
  return Boolean(supplied) && safeEqual(supplied, expected);
}

export function deviceUnauthorizedResponse(): Response {
  return new Response("ERROR: unauthorized device\r\n", {
    status: 401,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
