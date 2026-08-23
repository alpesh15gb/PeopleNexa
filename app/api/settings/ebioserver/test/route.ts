import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEbioserverConfig, testConnection } from "@/lib/ebioserver";
import { validateOutboundHttpUrl } from "@/lib/outbound-url";

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = getEbioserverConfig(tenant);
  try {
    await validateOutboundHttpUrl(profile.url);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : "Invalid eBioserver URL" }, { status: 400 });
  }
  const result = await testConnection(profile);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
