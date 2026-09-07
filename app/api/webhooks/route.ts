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
    select: {
      id: true,
      name: true,
      url: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  // Never leak the signing secret on list — callers only learn whether one exists.
  return NextResponse.json({ endpoints: endpoints.map((e) => ({ ...e, hasSecret: true })) });
}

/** Reject loopback / private / link-local / metadata hosts (SSRF guard). */
function isBlockedWebhookHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    h === "localhost" ||
    h === "metadata.google.internal" ||
    h === "metadata.google" ||
    h === "instance-data" ||
    h === "169.254.169.254" ||
    h === "::1" ||
    h === "::" ||
    h === "0.0.0.0"
  )
    return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".invalid"))
    return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — inspect the embedded IPv4.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ipv4 = mapped ? mapped[1] : h;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ipv4);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  if (h.includes(":") && (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd"))) return true;
  return false;
}

/** Shared URL check: https-only, parseable, no private/loopback/metadata hosts. */
function validateWebhookUrl(raw: string): string | null {
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) return "URL must start with https://";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "URL is invalid.";
  }
  if (parsed.protocol !== "https:") return "URL must start with https://";
  if (isBlockedWebhookHost(parsed.hostname))
    return "URL host is not allowed (private/loopback/metadata hosts are blocked).";
  return null;
}

/** POST — create an endpoint. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  const events: string[] = Array.isArray(body.events) ? body.events.map(String).filter((e: string) => WEBHOOK_EVENTS.includes(e as never)) : [];

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const urlError = validateWebhookUrl(url);
  if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
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
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });

  const events: string[] = Array.isArray(body.events) ? body.events.map(String).filter((e: string) => WEBHOOK_EVENTS.includes(e as never)) : [];
  if (body.url !== undefined) {
    const urlError = validateWebhookUrl(String(body.url ?? ""));
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 });
  }
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
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!endpoint) return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  await prisma.webhookEndpoint.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
