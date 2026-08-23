import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, saveEbioserverConfig } from "@/lib/ebioserver";
import { validateOutboundHttpUrl } from "@/lib/outbound-url";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = getEbioserverConfig(tenant);
  return NextResponse.json({
    profile: {
      url: profile.url,
      username: profile.username,
      hasPassword: Boolean(profile.passwordEnc),
      enabled: profile.enabled,
      pollIntervalMinutes: profile.pollIntervalMinutes,
      lastPulledAt: profile.lastPulledAt,
      lastError: profile.lastError,
      lastErrorAt: profile.lastErrorAt,
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const rawUrl = String(body.url ?? "").trim();
    const enabled = Boolean(body.enabled);
    const username = String(body.username ?? "").trim();
    const interval = Number(body.pollIntervalMinutes ?? 15);

    if (enabled && !rawUrl) {
      return NextResponse.json({ error: "eBioserver URL is required when sync is enabled." }, { status: 400 });
    }
    if (enabled && !username) {
      return NextResponse.json({ error: "eBioserver username is required when sync is enabled." }, { status: 400 });
    }
    if (!Number.isFinite(interval) || interval < 1 || interval > 1440) {
      return NextResponse.json({ error: "Polling interval must be between 1 and 1440 minutes." }, { status: 400 });
    }

    const url = rawUrl ? await validateOutboundHttpUrl(rawUrl) : "";
    const profile = await saveEbioserverConfig(session.tenantId, {
      url,
      username,
      password: body.password ? String(body.password) : "",
      enabled,
      pollIntervalMinutes: interval,
    });
    return NextResponse.json({
      success: true,
      profile: {
        url: profile.url,
        username: profile.username,
        hasPassword: Boolean(profile.passwordEnc),
        enabled: profile.enabled,
        pollIntervalMinutes: profile.pollIntervalMinutes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
