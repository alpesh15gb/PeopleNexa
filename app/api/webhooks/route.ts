import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS, dispatchWebhook } from "@/lib/webhooks";

/** GET — list the tenant's webhook endpoints. */
export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ endpoints });
}

/** POST — create an endpoint. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  const events: string[] = Array.isArray(body.events) ? body.events.map(String).filter((e: string) => WEBHOOK_EVENTS.includes(e as never)) : [];

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^https?:\/\//.test(url)) return NextResponse.json({ error: "URL must start with http(s)://" }, { status: 400 });
  if (events.length === 0) return NextResponse.json({ error: "Pick at least one event." }, { status: 400 });

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      tenantId: session.tenantId,
      name,
      url,
      events: events.join(","),
      secret: randomBytes(24).toString("hex"),
      active: true,
    },
  });
  return NextResponse.json({ endpoint }, { status: 201 });
}

/** PUT — update (toggle active / change URL or events). */
export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });

  const events: string[] = Array.isArray(body.events) ? body.events.map(String).filter((e: string) => WEBHOOK_EVENTS.includes(e as never)) : [];
  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...(body.name ? { name: String(body.name).trim() } : {}),
      ...(body.url ? { url: String(body.url).trim() } : {}),
      ...(events.length > 0 ? { events: events.join(",") } : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    },
  });
  return NextResponse.json({ endpoint: updated });
}

/** DELETE — remove an endpoint. */
export async function DELETE(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  await prisma.webhookEndpoint.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
