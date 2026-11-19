import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, saveWhatsAppConfig } from "@/lib/whatsapp";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const cfg = getWhatsAppConfig(tenant?.config ?? null);
  return NextResponse.json({
    config: { enabled: cfg.enabled, apiUrl: cfg.apiUrl, hasToken: Boolean(cfg.apiToken), sender: cfg.sender },
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || (body.enabled !== undefined && typeof body.enabled !== "boolean")) {
    return NextResponse.json({ error: "Send valid gateway settings." }, { status: 400 });
  }
  const enabled = body.enabled as boolean | undefined;
  // Undefined = field not sent → keep existing. Blank token = keep existing (eBio-style).
  const apiUrlRaw = body.apiUrl === undefined ? undefined : String(body.apiUrl).trim();
  const apiTokenRaw =
    typeof body.apiToken === "string" && body.apiToken.trim() ? body.apiToken.trim() : undefined;
  const senderRaw = body.sender === undefined ? undefined : String(body.sender ?? "").trim();
  if (apiUrlRaw) {
    const url = URL.canParse(apiUrlRaw) ? new URL(apiUrlRaw) : null;
    if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return NextResponse.json({ error: "Enter an HTTP or HTTPS gateway URL without embedded credentials." }, { status: 400 });
    }
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const current = getWhatsAppConfig(tenant?.config);
  if ((enabled ?? current.enabled) && !(apiUrlRaw ?? current.apiUrl).trim()) {
    return NextResponse.json({ error: "Enter a gateway URL before enabling notifications." }, { status: 400 });
  }
  const cfg = await saveWhatsAppConfig(session.tenantId, {
    enabled,
    ...(apiUrlRaw !== undefined ? { apiUrl: apiUrlRaw } : {}),
    ...(apiTokenRaw !== undefined ? { apiToken: apiTokenRaw } : {}),
    ...(senderRaw !== undefined ? { sender: senderRaw } : {}),
  });
  return NextResponse.json({
    success: true,
    config: { enabled: cfg.enabled, apiUrl: cfg.apiUrl, hasToken: Boolean(cfg.apiToken), sender: cfg.sender },
  });
}
