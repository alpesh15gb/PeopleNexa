import { NextResponse } from "next/server";
import { getEbioserverConfig, syncEbioWorksites } from "@/lib/ebioserver";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";

/** POST — map eBio locations/devices to PeopleNexa locations/worksite branches. */
export async function POST() {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });
  const profile = getEbioserverConfig(tenant);
  if (!profile.url || !profile.username || !profile.passwordEnc) {
    return NextResponse.json({ error: "Configure and save the eBioserver connection first." }, { status: 400 });
  }
  try {
    const result = await syncEbioWorksites(session.tenantId, profile);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sync eBio worksite mapping." }, { status: 500 });
  }
}
