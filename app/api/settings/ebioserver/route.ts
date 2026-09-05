import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, saveEbioserverConfig } from "@/lib/ebioserver";

export async function GET() {
  const session = await requireActiveSession().catch(() => null);
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
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const url = String(body.url ?? "");
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
    }
    const profile = await saveEbioserverConfig(session.tenantId, {
      url,
      username: String(body.username ?? ""),
      password: body.password ? String(body.password) : "",
      enabled: Boolean(body.enabled),
      pollIntervalMinutes: Number(body.pollIntervalMinutes ?? 15),
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
