import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhooks";

/** POST /api/webhooks/test — fire a signed test event to one endpoint. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });

  await dispatchWebhook(session.tenantId, "punch.created", {
    test: true,
    message: "PeopleNexa webhook test — verify the X-PeopleNexa-Signature header on your side.",
  });
  return NextResponse.json({ success: true });
}
