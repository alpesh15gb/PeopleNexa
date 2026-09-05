import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fireWebhook } from "@/lib/webhooks";

/** POST /api/webhooks/test — fire a signed test event to one endpoint. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "Endpoint id is required." }, { status: 400 });
  }
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });

  try {
    await fireWebhook(endpoint.url, endpoint.secret, "punch.created", {
      test: true,
      message: "PeopleNexa webhook test — verify the X-PeopleNexa-Signature header on your side.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test delivery failed." },
      { status: 502 }
    );
  }
  return NextResponse.json({ success: true });
}
