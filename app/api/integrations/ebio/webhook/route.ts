import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Temporary eBioServerNew capture endpoint. Keep this receive-only until a
 * real vendor payload has been inspected and its serial mapping is verified.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  console.info("[eBio webhook] raw request body:", rawBody);

  return new Response("Success", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
