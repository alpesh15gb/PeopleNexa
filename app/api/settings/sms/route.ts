import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSmsConfig, saveSmsConfig } from "@/lib/sms";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
  if (session?.role === "branch_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const cfg = getSmsConfig(tenant?.config ?? null);
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
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    (body.enabled !== undefined && typeof body.enabled !== "boolean") ||
    ["apiUrl", "apiToken", "sender"].some((key) => body[key] != null && typeof body[key] !== "string")) {
    return NextResponse.json({ error: "Send valid SMS gateway settings." }, { status: 400 });
  }
  const enabled = body.enabled as boolean | undefined;
  const apiUrl = body.apiUrl === undefined ? undefined : (body.apiUrl ?? "").trim();
  const apiToken = body.apiToken?.trim() || undefined;
  const sender = body.sender === undefined ? undefined : (body.sender ?? "").trim();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { config: true } });
  const current = getSmsConfig(tenant?.config);
  const effectiveUrl = apiUrl ?? current.apiUrl;
  if (apiUrl || (enabled ?? current.enabled)) {
    const url = /^https?:\/\//i.test(effectiveUrl) && URL.canParse(effectiveUrl) ? new URL(effectiveUrl) : null;
    if (!url || url.username || url.password) {
      return NextResponse.json({ error: "Enter an HTTP or HTTPS gateway URL without embedded credentials." }, { status: 400 });
    }
  }
  if ((enabled ?? current.enabled) && !(apiToken ?? current.apiToken).trim()) {
    return NextResponse.json({ error: "Enter a bearer token before enabling SMS notifications." }, { status: 400 });
  }
  const cfg = await saveSmsConfig(session.tenantId, {
    enabled, apiUrl, apiToken, sender,
  });
  return NextResponse.json({
    success: true,
    config: { enabled: cfg.enabled, apiUrl: cfg.apiUrl, hasToken: Boolean(cfg.apiToken), sender: cfg.sender },
  });
}
