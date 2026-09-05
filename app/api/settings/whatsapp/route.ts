import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, saveWhatsAppConfig } from "@/lib/whatsapp";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
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
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  // Undefined = field not sent → keep existing. Blank token = keep existing (eBio-style).
  const apiUrlRaw = body.apiUrl === undefined ? undefined : String(body.apiUrl);
  const apiTokenRaw =
    body.apiToken == null || String(body.apiToken) === "" ? undefined : String(body.apiToken);
  const senderRaw = body.sender === undefined ? undefined : String(body.sender ?? "");
  if (apiUrlRaw !== undefined && apiUrlRaw !== "" && !/^https?:\/\//i.test(apiUrlRaw)) {
    return NextResponse.json({ error: "API URL must start with http:// or https://" }, { status: 400 });
  }
  if (enabled) {
    let effectiveUrl = apiUrlRaw;
    if (effectiveUrl === undefined) {
      const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
      effectiveUrl = getWhatsAppConfig(tenant?.config ?? null).apiUrl;
    }
    if (!effectiveUrl || !effectiveUrl.trim()) {
      return NextResponse.json({ error: "Cannot enable WhatsApp without an API URL." }, { status: 400 });
    }
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
