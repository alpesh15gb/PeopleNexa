import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveSession } from "@/lib/session";
import { parseWorkspaceRegion, workspaceRegion } from "@/lib/workspace-region";
import { isTransactionWriteConflict } from "@/lib/transaction-conflict";

export async function PUT(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Only workspace administrators can save regional settings." }, { status: 403 });
  const region = parseWorkspaceRegion(await req.json().catch(() => null));
  if (!region) return NextResponse.json({ error: "Enter a valid country code, currency code, locale and IANA time zone." }, { status: 400 });

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId }, select: { config: true } });
      const current = workspaceRegion(tenant.config);
      if (current.timeZone !== region.timeZone) {
        const tenantId = session.tenantId;
        const [punch, record, correction] = await Promise.all([
          tx.punch.findFirst({ where: { tenantId }, select: { id: true } }),
          tx.attendance.findFirst({ where: { tenantId }, select: { id: true } }),
          tx.punchCorrection.findFirst({ where: { tenantId }, select: { id: true } }),
        ]);
        if (punch || record || correction) return false;
      }
      const config = tenant.config && typeof tenant.config === "object" && !Array.isArray(tenant.config) ? tenant.config : {};
      await tx.tenant.update({ where: { id: session.tenantId }, data: { config: { ...config, workspaceRegion: region } } });
      await tx.auditLog.create({ data: { tenantId: session.tenantId, actorId: session.sub, actorRole: session.role, action: "configuration.workspace_region.update", entity: "Tenant", entityId: session.tenantId, summary: "Updated workspace regional settings", before: current, after: region } });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!saved) return NextResponse.json({ error: "This workspace has attendance history. Changing its operational time zone requires a dated migration to preserve existing records." }, { status: 409 });
    return NextResponse.json({ region });
  } catch (error) {
    if (isTransactionWriteConflict(error)) return NextResponse.json({ error: "Workspace settings changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
