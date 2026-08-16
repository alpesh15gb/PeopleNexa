import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, saveWhatsAppConfig } from "@/lib/whatsapp";

export async function GET() {
  const session = await getSession();
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
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const apiUrl = String(body.apiUrl ?? "");
  if (apiUrl && !/^https?:\/\//i.test(apiUrl)) {
    return NextResponse.json({ error: "API URL must start with http:// or https://" }, { status: 400 });
  }
  const cfg = await saveWhatsAppConfig(session.tenantId, {
    enabled: Boolean(body.enabled),
    apiUrl,
    apiToken: body.apiToken ? String(body.apiToken) : "",
    sender: String(body.sender ?? ""),
  });
  return NextResponse.json({
    success: true,
    config: { enabled: cfg.enabled, apiUrl: cfg.apiUrl, hasToken: Boolean(cfg.apiToken), sender: cfg.sender },
  });
}
